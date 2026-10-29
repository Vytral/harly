import "server-only";

import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";

import {
  aiActionReceipts,
  applications,
  candidates,
  db,
  interviews,
  jobs,
  offers,
  tasks,
} from "@harly/db";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { getRolePolicy } from "@/features/workspaces/permissions-server";
import {
  candidateScopeSql,
  isUnrestrictedScope,
  jobScopeSql,
  taskScopeSql,
  type WorkspaceSearchActor,
} from "@/features/search/scope";

const RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ActionReceiptResult = {
  success: boolean;
  error?: string;
  message?: string;
  receiptId?: string;
  replayed?: boolean;
  undo?: AgentActionUndo;
  [key: string]: unknown;
};

export type AgentActionUndo =
  | {
      kind: "moveCandidateStage";
      applicationId: string;
      expectedCurrentStageId: string;
      previousStageId: string;
    }
  | {
      kind: "deleteTask";
      taskId: string;
      expectedUpdatedAt: string;
    }
  | {
      kind: "cancelInterview";
      interviewId: string;
      candidateId: string;
      expectedStatus: "scheduled";
    };

export type AgentActionReceiptSummary = {
  receiptId: string;
  toolName: string;
  status: "processing" | "completed" | "failed";
  success: boolean | null;
  message: string | null;
  undoable: boolean;
  createdAt: string;
};

type ReceiptReservation =
  | {
      kind: "reserved";
      receiptId: string;
      complete: (result: ActionReceiptResult) => Promise<void>;
    }
  | {
      kind: "replay";
      receiptId: string;
      result: ActionReceiptResult;
    }
  | {
      kind: "conflict";
      error: string;
    };

function requestHash(toolName: string, input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ toolName, input }))
    .digest("hex");
}

/**
 * Reserves one Harly confirmation card for execution.
 *
 * The interface deliberately hides the transaction and storage details from
 * write-actions.ts. A duplicate confirmation replays the normalized result;
 * a different payload with the same action id is rejected; a live reservation
 * is treated as processing so two browser retries cannot run concurrently.
 */
export async function reserveAgentAction(input: {
  workspaceId: string;
  actorId: string;
  actionId: string;
  toolName: string;
  normalizedInput: unknown;
}): Promise<ReceiptReservation> {
  const actionId = input.actionId.trim();
  if (!actionId || actionId.length > 255) {
    return { kind: "conflict", error: "Invalid action receipt id." };
  }

  const now = new Date();
  const hash = requestHash(input.toolName, input.normalizedInput);
  const expiresAt = new Date(now.getTime() + RECEIPT_TTL_MS);

  return db.transaction(async (tx) => {
    // A tool-call id is not reused by the AI SDK. Removing expired rows keeps
    // this operational ledger bounded while preserving a 30-day retry window.
    await tx
      .delete(aiActionReceipts)
      .where(
        and(
          eq(aiActionReceipts.workspaceId, input.workspaceId),
          eq(aiActionReceipts.actionId, actionId),
          lt(aiActionReceipts.expiresAt, now),
        ),
      );

    const [created] = await tx
      .insert(aiActionReceipts)
      .values({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        actionId,
        toolName: input.toolName,
        requestHash: hash,
        expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: aiActionReceipts.id });

    if (created) {
      return {
        kind: "reserved" as const,
        receiptId: created.id,
        complete: async (result: ActionReceiptResult) => {
          await db
            .update(aiActionReceipts)
            .set({
              status: result.success ? "completed" : "failed",
              result,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(aiActionReceipts.id, created.id),
                eq(aiActionReceipts.status, "processing"),
              ),
            );
        },
      };
    }

    const [existing] = await tx
      .select({
        id: aiActionReceipts.id,
        requestHash: aiActionReceipts.requestHash,
        status: aiActionReceipts.status,
        result: aiActionReceipts.result,
      })
      .from(aiActionReceipts)
      .where(
        and(
          eq(aiActionReceipts.workspaceId, input.workspaceId),
          eq(aiActionReceipts.actionId, actionId),
        ),
      )
      .limit(1);

    if (!existing) {
      return { kind: "conflict" as const, error: "Could not reserve the action." };
    }
    if (existing.requestHash !== hash) {
      return {
        kind: "conflict" as const,
        error: "This confirmation id was already used for a different action.",
      };
    }
    if (
      (existing.status === "completed" || existing.status === "failed") &&
      existing.result &&
      typeof existing.result === "object" &&
      !Array.isArray(existing.result)
    ) {
      return {
        kind: "replay" as const,
        receiptId: existing.id,
        result: existing.result as ActionReceiptResult,
      };
    }

    return {
      kind: "conflict" as const,
      error: "This action is already being processed. Please wait a moment.",
    };
  });
}

export async function getAgentActionReceipt(input: {
  workspaceId: string;
  actorId: string;
  receiptId: string;
}): Promise<{ result: ActionReceiptResult; toolName: string } | null> {
  const [receipt] = await db
    .select({
      result: aiActionReceipts.result,
      toolName: aiActionReceipts.toolName,
      status: aiActionReceipts.status,
    })
    .from(aiActionReceipts)
    .where(
      and(
        eq(aiActionReceipts.id, input.receiptId),
        eq(aiActionReceipts.workspaceId, input.workspaceId),
        eq(aiActionReceipts.actorId, input.actorId),
        eq(aiActionReceipts.status, "completed"),
      ),
    )
    .limit(1);

  if (!receipt?.result || typeof receipt.result !== "object" || Array.isArray(receipt.result)) {
    return null;
  }
  return { result: receipt.result as ActionReceiptResult, toolName: receipt.toolName };
}

/**
 * Reaps confirmations whose request handler disappeared after reservation.
 * A permanent `processing` row is worse than a failed result: it makes every
 * legitimate retry look concurrent forever. The transition is conditional on
 * the current status, so a late handler completion can never overwrite a
 * receipt that was already completed by another worker.
 */
export async function reapStaleProcessingAgentReceipts(
  olderThanMinutes = 10,
  limit = 100,
): Promise<number> {
  const threshold = new Date(Date.now() - Math.max(1, olderThanMinutes) * 60_000);
  const maxRows = Math.max(1, Math.min(500, Math.floor(limit)));
  return db.transaction(async (tx) => {
    const stale = await tx
      .select({ id: aiActionReceipts.id })
      .from(aiActionReceipts)
      .where(
        and(
          eq(aiActionReceipts.status, "processing"),
          lt(aiActionReceipts.updatedAt, threshold),
        ),
      )
      .orderBy(aiActionReceipts.updatedAt)
      .limit(maxRows)
      .for("update", { skipLocked: true });

    let reaped = 0;
    for (const receipt of stale) {
      const [updated] = await tx
        .update(aiActionReceipts)
        .set({
          status: "failed",
          result: {
            success: false,
            error: "The confirmation worker timed out before completing this action. Please confirm again.",
            reaped: true,
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiActionReceipts.id, receipt.id),
            eq(aiActionReceipts.status, "processing"),
          ),
        )
        .returning({ id: aiActionReceipts.id });
      if (updated) reaped += 1;
    }
    return reaped;
  });
}

type ReceiptTargetKey =
  | "applicationId"
  | "candidateId"
  | "jobId"
  | "taskId"
  | "interviewId"
  | "offerId";

type ReceiptTargets = Partial<Record<ReceiptTargetKey, string>>;

const RECEIPT_TARGET_KEYS: readonly ReceiptTargetKey[] = [
  "applicationId",
  "candidateId",
  "jobId",
  "taskId",
  "interviewId",
  "offerId",
];

/**
 * The records a stored receipt refers to. Undo payloads name the record they
 * reverse. Receipts may also declare `targets` explicitly. Receipt messages
 * can contain record names, so only these ids decide what the actor may see.
 */
function receiptTargets(result: Record<string, unknown> | null): ReceiptTargets {
  const targets: ReceiptTargets = {};
  const undo = parseAgentActionUndo(result?.undo);
  if (undo?.kind === "moveCandidateStage") targets.applicationId = undo.applicationId;
  if (undo?.kind === "deleteTask") targets.taskId = undo.taskId;
  if (undo?.kind === "cancelInterview") {
    targets.interviewId = undo.interviewId;
    targets.candidateId = undo.candidateId;
  }
  const declared = result?.targets;
  if (declared && typeof declared === "object" && !Array.isArray(declared)) {
    for (const key of RECEIPT_TARGET_KEYS) {
      const value = (declared as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) targets[key] = value;
    }
  }
  return targets;
}

/** Record ids (by key) that the actor can see, judged by the scope predicates. */
type VisibleRecords = Record<ReceiptTargetKey, Set<string>>;

async function visibleReceiptRecords(
  actor: WorkspaceSearchActor,
  wanted: Record<ReceiptTargetKey, string[]>,
): Promise<VisibleRecords> {
  const visible: VisibleRecords = {
    applicationId: new Set(),
    candidateId: new Set(),
    jobId: new Set(),
    taskId: new Set(),
    interviewId: new Set(),
    offerId: new Set(),
  };
  const ws = actor.workspaceId;
  if (wanted.applicationId.length > 0) {
    const rows = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(
        and(
          eq(applications.workspaceId, ws),
          eq(jobs.workspaceId, ws),
          inArray(applications.id, wanted.applicationId),
          jobScopeSql(actor),
        ),
      );
    for (const row of rows) visible.applicationId.add(row.id);
  }
  if (wanted.candidateId.length > 0) {
    const rows = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, ws),
          inArray(candidates.id, wanted.candidateId),
          candidateScopeSql(actor, candidates.id),
        ),
      );
    for (const row of rows) visible.candidateId.add(row.id);
  }
  if (wanted.jobId.length > 0) {
    const rows = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, ws), inArray(jobs.id, wanted.jobId), jobScopeSql(actor)));
    for (const row of rows) visible.jobId.add(row.id);
  }
  if (wanted.taskId.length > 0) {
    const rows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, ws), inArray(tasks.id, wanted.taskId), taskScopeSql(actor)));
    for (const row of rows) visible.taskId.add(row.id);
  }
  if (wanted.interviewId.length > 0) {
    const rows = await db
      .select({ id: interviews.id })
      .from(interviews)
      .innerJoin(jobs, eq(jobs.id, interviews.jobId))
      .where(
        and(
          eq(interviews.workspaceId, ws),
          eq(jobs.workspaceId, ws),
          inArray(interviews.id, wanted.interviewId),
          jobScopeSql(actor),
        ),
      );
    for (const row of rows) visible.interviewId.add(row.id);
  }
  if (wanted.offerId.length > 0) {
    // An offer is judged by its job, the same way the offer lists judge it.
    const rows = await db
      .select({ id: offers.id })
      .from(offers)
      .innerJoin(jobs, eq(jobs.id, offers.jobId))
      .where(
        and(
          eq(offers.workspaceId, ws),
          eq(jobs.workspaceId, ws),
          inArray(offers.id, wanted.offerId),
          jobScopeSql(actor),
        ),
      );
    for (const row of rows) visible.offerId.add(row.id);
  }
  return visible;
}

/**
 * The actor's scope, resolved from the request's own session. The listing is
 * keyed by workspace and user, so a mismatch yields no actor at all.
 */
async function receiptListingActor(input: {
  workspaceId: string;
  actorId: string;
}): Promise<WorkspaceSearchActor | null> {
  const context = await getWorkspaceContextOrNull();
  if (
    !context ||
    context.organization.id !== input.workspaceId ||
    context.user.id !== input.actorId
  ) {
    return null;
  }
  const policy = await getRolePolicy(context.organization.id, context.roleKey);
  return {
    workspaceId: context.organization.id,
    userId: context.user.id,
    permissions: policy.permissions,
    scope: policy.scope,
  };
}

/** Neutral text that replaces a receipt message the actor may not see. */
function genericReceiptMessage(success: boolean | null): string | null {
  if (success === true) return "Action completed.";
  if (success === false) return "Action failed.";
  return null;
}

/**
 * Returns a compact, actor-scoped activity feed for Harly. Raw inputs and
 * action results stay server-side; the agent only needs enough information to
 * explain what happened and select a reversible receipt for an undo.
 *
 * A receipt keeps its message and undo only when every record it refers to is
 * inside the caller's scope. Otherwise its message is replaced with a generic
 * one and it is not undoable. A receipt with no resolvable record cannot be
 * shown to a restricted caller, because its message may name one. An
 * unrestricted caller can see every record in the workspace, so nothing is
 * withheld.
 */
export async function listAgentActionReceipts(input: {
  workspaceId: string;
  actorId: string;
  limit?: number;
}): Promise<AgentActionReceiptSummary[]> {
  const limit = Math.max(1, Math.min(20, Math.floor(input.limit ?? 10)));
  const now = new Date();
  const actor = await receiptListingActor(input);
  if (!actor) return [];
  const rows = await db
    .select({
      id: aiActionReceipts.id,
      toolName: aiActionReceipts.toolName,
      status: aiActionReceipts.status,
      result: aiActionReceipts.result,
      createdAt: aiActionReceipts.createdAt,
    })
    .from(aiActionReceipts)
    .where(
      and(
        eq(aiActionReceipts.workspaceId, input.workspaceId),
        eq(aiActionReceipts.actorId, input.actorId),
        gt(aiActionReceipts.expiresAt, now),
      ),
    )
    .orderBy(desc(aiActionReceipts.createdAt))
    .limit(limit);

  const results = rows.map((row) =>
    row.result && typeof row.result === "object" && !Array.isArray(row.result)
      ? (row.result as Record<string, unknown>)
      : null,
  );
  const targetsByRow = results.map((result) => receiptTargets(result));

  const restricted = !isUnrestrictedScope(actor.scope);
  const wanted: Record<ReceiptTargetKey, string[]> = {
    applicationId: [],
    candidateId: [],
    jobId: [],
    taskId: [],
    interviewId: [],
    offerId: [],
  };
  if (restricted) {
    for (const targets of targetsByRow) {
      for (const key of RECEIPT_TARGET_KEYS) {
        const id = targets[key];
        if (id) wanted[key].push(id);
      }
    }
    for (const key of RECEIPT_TARGET_KEYS) wanted[key] = [...new Set(wanted[key])];
  }
  const visible = restricted
    ? await visibleReceiptRecords(actor, wanted)
    : null;

  return rows.map((row, index) => {
    const result = results[index];
    const rawMessage = typeof result?.message === "string" ? result.message : null;
    const success = typeof result?.success === "boolean" ? result.success : null;
    const undo = parseAgentActionUndo(result?.undo);
    let inScope = true;
    if (visible) {
      const targets = targetsByRow[index];
      const keys = RECEIPT_TARGET_KEYS.filter((key) => targets[key]);
      inScope =
        keys.length > 0 &&
        keys.every((key) => visible[key].has(targets[key]!));
    }
    return {
      receiptId: row.id,
      toolName: row.toolName,
      status:
        row.status === "processing" || row.status === "completed" || row.status === "failed"
          ? row.status
          : "failed",
      success,
      message: inScope ? rawMessage : genericReceiptMessage(success),
      undoable: inScope && Boolean(undo),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export function parseAgentActionUndo(value: unknown): AgentActionUndo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const undo = value as Record<string, unknown>;
  if (undo.kind === "moveCandidateStage") {
    if (
      typeof undo.applicationId !== "string" ||
      typeof undo.expectedCurrentStageId !== "string" ||
      typeof undo.previousStageId !== "string"
    ) {
      return null;
    }
    return {
      kind: "moveCandidateStage",
      applicationId: undo.applicationId,
      expectedCurrentStageId: undo.expectedCurrentStageId,
      previousStageId: undo.previousStageId,
    };
  }
  if (undo.kind === "deleteTask") {
    if (
      typeof undo.taskId !== "string" ||
      typeof undo.expectedUpdatedAt !== "string" ||
      Number.isNaN(new Date(undo.expectedUpdatedAt).getTime())
    ) {
      return null;
    }
    return {
      kind: "deleteTask",
      taskId: undo.taskId,
      expectedUpdatedAt: undo.expectedUpdatedAt,
    };
  }
  if (
    undo.kind === "cancelInterview" &&
    typeof undo.interviewId === "string" &&
    typeof undo.candidateId === "string" &&
    undo.expectedStatus === "scheduled"
  ) {
    return {
      kind: "cancelInterview",
      interviewId: undo.interviewId,
      candidateId: undo.candidateId,
      expectedStatus: "scheduled",
    };
  }
  return null;
}
