import "server-only";

import { createHash } from "node:crypto";
import { and, desc, eq, gt, lt } from "drizzle-orm";

import { aiActionReceipts, db } from "@harly/db";

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
 * Returns a compact, actor-scoped activity feed for Harly. Raw inputs and
 * action results stay server-side; the agent only needs enough information to
 * explain what happened and select a reversible receipt for an undo.
 */
export async function listAgentActionReceipts(input: {
  workspaceId: string;
  actorId: string;
  limit?: number;
}): Promise<AgentActionReceiptSummary[]> {
  const limit = Math.max(1, Math.min(20, Math.floor(input.limit ?? 10)));
  const now = new Date();
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

  return rows.map((row) => {
    const result =
      row.result && typeof row.result === "object" && !Array.isArray(row.result)
        ? (row.result as Record<string, unknown>)
        : null;
    return {
      receiptId: row.id,
      toolName: row.toolName,
      status:
        row.status === "processing" || row.status === "completed" || row.status === "failed"
          ? row.status
          : "failed",
      success: typeof result?.success === "boolean" ? result.success : null,
      message: typeof result?.message === "string" ? result.message : null,
      undoable: Boolean(parseAgentActionUndo(result?.undo)),
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
