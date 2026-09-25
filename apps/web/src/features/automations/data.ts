import "server-only";

import {
  and,
  avg,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
  sum,
} from "drizzle-orm";

import { ApiError, decodeCursor, paginate, type Cursor } from "@harly/api";
import {
  db,
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowNodeAttempts,
  workflowNodeExecutions,
  workflowRunSteps,
  workflowRuns,
  workspaceAutomationPolicies,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowRunStep,
} from "@harly/db";
import {
  approveDraft,
  createWorkflowWithDraft,
  listHydratedWorkflows,
  loadHydratedWorkflow,
  publishDraft,
  requestDraftApproval,
  rollbackVersionToDraft,
  saveWorkflowDraft,
  type HydratedWorkflow,
} from "./definition/service";

import {
  type Action,
  type Conditions,
  type Trigger,
  type WorkflowEvent,
  type WorkflowDefinitionInput,
} from "./schema";
import { parseGraph } from "./definition/schema-v2";
import { jsonValueSchema } from "./definition/schema-v2";
import { compileGraph } from "./definition/compile";
import { effectiveApprovalPolicy } from "./runtime/approval-policy";
import { assertNotDemo } from "@/features/demo/assert-not-demo";

/**
 * Automations data layer (§3.1). All queries are workspace-scoped: every read
 * and write filters by `workspaceId`, so a workflow from workspace A can never
 * leak into workspace B. Persisted jsonb (trigger/conditions/actions) is
 * re-validated with Zod on the way in (§3.4) — never trust raw client JSONB.
 *
 * The denormalized `triggerEvent` column is kept in sync with `trigger.event`
 * so the dispatch hot path can index on it without parsing jsonb.
 */

// ---------------------------------------------------------------------------
// Serialization (API + UI shape — ISO strings, plain objects)
// ---------------------------------------------------------------------------

export function serializeWorkflow(def: WorkflowDefinition | HydratedWorkflow) {
  const hydrated = def as HydratedWorkflow;
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    enabled: def.enabled,
    status: def.status,
    definitionVersion: def.definitionVersion,
    approvalRequestedAt: def.approvalRequestedAt?.toISOString() ?? null,
    approvedById: def.approvedById,
    approvedAt: def.approvedAt?.toISOString() ?? null,
    publishedById: def.publishedById,
    publishedAt: def.publishedAt?.toISOString() ?? null,
    maxRunsPerMinute: def.maxRunsPerMinute,
    maxExternalActionsPerMinute: def.maxExternalActionsPerMinute,
    circuitBreakerThreshold: def.circuitBreakerThreshold,
    circuitBreakerCooldownSeconds: def.circuitBreakerCooldownSeconds,
    circuitOpenUntil: def.circuitOpenUntil?.toISOString() ?? null,
    deletedAt: def.deletedAt?.toISOString() ?? null,
    triggerEvent: def.triggerEvent as WorkflowEvent,
    trigger: def.trigger as Trigger,
    conditions: def.conditions as Conditions,
    actions: def.actions as Action[],
    createdById: def.createdById,
    createdAt: def.createdAt.toISOString(),
    updatedAt: def.updatedAt.toISOString(),
    draftRevision: hydrated.draftRevision ?? 0,
    contentHash: hydrated.contentHash ?? "",
    reviewHash: hydrated.reviewHash ?? null,
    hasUnpublishedChanges: Boolean(hydrated.hasUnpublishedChanges),
    engineVersion: def.engineVersion ?? 1,
    graph: hydrated.graph,
    layout: hydrated.layout,
  };
}

export function serializeRun(run: WorkflowRun) {
  return {
    id: run.id,
    workflowId: run.workflowId,
    triggerEvent: run.triggerEvent,
    triggerPayload: run.triggerPayload,
    conditionResult: run.conditionResult,
    status: run.status,
    logicalStatus: run.logicalStatus,
    sourceEventId: run.sourceEventId,
    definitionVersion: run.definitionVersion,
    attemptCount: run.attemptCount,
    maxAttempts: run.maxAttempts,
    nextAttemptAt: run.nextAttemptAt.toISOString(),
    lockedAt: run.lockedAt?.toISOString() ?? null,
    heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
    deadLetteredAt: run.deadLetteredAt?.toISOString() ?? null,
    cancelRequestedAt: run.cancelRequestedAt?.toISOString() ?? null,
    cancelledAt: run.cancelledAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    startStepIndex: run.startStepIndex,
    replayOfRunId: run.replayOfRunId,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    parentRunId: run.parentRunId,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
  };
}

export function serializeRunStep(step: WorkflowRunStep & { nodeId?: string }) {
  return {
    id: step.id,
    runId: step.runId,
    nodeId: step.nodeId,
    stepIndex: step.stepIndex,
    actionType: step.actionType,
    actionInput: step.actionInput,
    result: step.result,
    status: step.status,
    retryable: step.retryable,
    attemptCount: step.attemptCount,
    errorCode: step.errorCode,
    startedAt: step.startedAt.toISOString(),
    finishedAt: step.finishedAt?.toISOString() ?? null,
  };
}

export function serializeWorkflowVersion(
  version: import("@harly/db").WorkflowDefinitionVersion,
) {
  return {
    id: version.id,
    workflowId: version.workflowId,
    version: version.version,
    name: version.name,
    description: version.description,
    triggerEvent: version.triggerEvent as WorkflowEvent,
    trigger: version.trigger as Trigger,
    conditions: version.conditions as Conditions,
    actions: version.actions as Action[],
    createdById: version.createdById,
    approvedById: version.approvedById,
    approvedAt: version.approvedAt?.toISOString() ?? null,
    publishedById: version.publishedById,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    maxRunsPerMinute: version.maxRunsPerMinute,
    maxExternalActionsPerMinute: version.maxExternalActionsPerMinute,
    circuitBreakerThreshold: version.circuitBreakerThreshold,
    circuitBreakerCooldownSeconds: version.circuitBreakerCooldownSeconds,
    createdAt: version.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Workflow CRUD
// ---------------------------------------------------------------------------

export async function listWorkflows(
  workspaceId: string,
): Promise<HydratedWorkflow[]> {
  return listHydratedWorkflows(workspaceId);
}

export type WorkspaceAutomationPolicySnapshot = {
  enabled: boolean;
  maxRunsPerMinute: number;
  maxExternalActionsPerMinute: number;
  maxConcurrentRuns: number;
  pausedAt: string | null;
  pausedById: string | null;
  pauseReason: string | null;
};

function serializeWorkspaceAutomationPolicy(
  policy: typeof workspaceAutomationPolicies.$inferSelect,
): WorkspaceAutomationPolicySnapshot {
  return {
    enabled: policy.enabled,
    maxRunsPerMinute: policy.maxRunsPerMinute,
    maxExternalActionsPerMinute: policy.maxExternalActionsPerMinute,
    maxConcurrentRuns: policy.maxConcurrentRuns,
    pausedAt: policy.pausedAt?.toISOString() ?? null,
    pausedById: policy.pausedById,
    pauseReason: policy.pauseReason,
  };
}

export async function getWorkspaceAutomationPolicy(
  workspaceId: string,
): Promise<WorkspaceAutomationPolicySnapshot> {
  await db
    .insert(workspaceAutomationPolicies)
    .values({ workspaceId })
    .onConflictDoNothing();
  const [policy] = await db
    .select()
    .from(workspaceAutomationPolicies)
    .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId))
    .limit(1);
  if (!policy) throw ApiError.notFound("Workspace not found.");
  return serializeWorkspaceAutomationPolicy(policy);
}

export async function setWorkspaceAutomationEnabled(input: {
  workspaceId: string;
  actorId: string;
  enabled: boolean;
  reason: string;
}): Promise<WorkspaceAutomationPolicySnapshot> {
  const reason = input.reason.trim();
  if (!reason) throw ApiError.badRequest("A reason is required.");
  if (reason.length > 500)
    throw ApiError.badRequest("Reason must be 500 characters or fewer.");
  await db
    .insert(workspaceAutomationPolicies)
    .values({ workspaceId: input.workspaceId })
    .onConflictDoNothing();
  const now = new Date();
  const [policy] = await db
    .update(workspaceAutomationPolicies)
    .set({
      enabled: input.enabled,
      pausedAt: input.enabled ? null : now,
      pausedById: input.enabled ? null : input.actorId,
      pauseReason: input.enabled ? null : reason,
      updatedById: input.actorId,
      updatedAt: now,
    })
    .where(eq(workspaceAutomationPolicies.workspaceId, input.workspaceId))
    .returning();
  if (!policy) throw ApiError.notFound("Workspace not found.");
  return serializeWorkspaceAutomationPolicy(policy);
}

export type PendingWorkflowApproval = {
  runId: string;
  workflowId: string;
  workflowName: string;
  nodeId: string;
  triggerEvent: string;
  candidateName: string | null;
  deadlineAt: string | null;
  createdAt: string;
  status: "pending" | "expired";
};

/**
 * List only execution approvals the current member can actually resolve.
 * Eligibility is read from the published graph, while the waiting state is
 * read from PostgreSQL; the UI never treats a stale client-side list as
 * authorization.
 */
export async function listPendingWorkflowApprovals(input: {
  workspaceId: string;
  actorId: string;
  limit?: number;
}): Promise<PendingWorkflowApproval[]> {
  const rows = await db
    .select({
      runId: workflowRuns.id,
      workflowId: workflowRuns.workflowId,
      workflowName: workflowDefinitions.name,
      nodeId: workflowNodeExecutions.nodeId,
      triggerEvent: workflowRuns.triggerEvent,
      triggerPayload: workflowRuns.triggerPayload,
      deadlineAt: workflowNodeExecutions.deadlineAt,
      createdAt: workflowNodeExecutions.createdAt,
      inputSnapshot: workflowNodeExecutions.inputSnapshot,
      graph: workflowDefinitionVersions.graph,
    })
    .from(workflowNodeExecutions)
    .innerJoin(
      workflowRuns,
      and(
        eq(workflowRuns.id, workflowNodeExecutions.runId),
        eq(workflowRuns.workspaceId, workflowNodeExecutions.workspaceId),
      ),
    )
    .innerJoin(
      workflowDefinitions,
      and(
        eq(workflowDefinitions.id, workflowRuns.workflowId),
        eq(workflowDefinitions.workspaceId, workflowRuns.workspaceId),
        isNull(workflowDefinitions.deletedAt),
      ),
    )
    .innerJoin(
      workflowDefinitionVersions,
      and(
        eq(workflowDefinitionVersions.id, workflowRuns.versionId),
        eq(workflowDefinitionVersions.workspaceId, workflowRuns.workspaceId),
      ),
    )
    .where(
      and(
        eq(workflowNodeExecutions.workspaceId, input.workspaceId),
        eq(workflowNodeExecutions.status, "waiting"),
        eq(workflowNodeExecutions.waitingKind, "approval"),
        eq(workflowRuns.logicalStatus, "waiting"),
        eq(workflowRuns.status, "running"),
      ),
    )
    .orderBy(
      workflowNodeExecutions.deadlineAt,
      workflowNodeExecutions.createdAt,
    )
    .limit(input.limit ?? 25);

  return rows.flatMap((row) => {
    try {
      const graph = parseGraph(row.graph);
      const node = graph.nodes.find(
        (
          candidate,
        ): candidate is Extract<typeof candidate, { type: "approval" }> =>
          candidate.type === "approval" && candidate.id === row.nodeId,
      );
      if (!node) {
        return [];
      }
      const policy = effectiveApprovalPolicy(node, row.inputSnapshot);
      if (!policy.eligibleActorIds.includes(input.actorId)) return [];
      const payload = row.triggerPayload as Record<string, unknown> | null;
      const candidate = payload?.candidate;
      const candidateRecord =
        candidate && typeof candidate === "object" && !Array.isArray(candidate)
          ? (candidate as Record<string, unknown>)
          : null;
      const candidateName = candidateRecord
        ? [candidateRecord.firstName, candidateRecord.lastName]
            .filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            )
            .join(" ") || null
        : null;
      return [
        {
          runId: row.runId,
          workflowId: row.workflowId,
          workflowName: row.workflowName,
          nodeId: row.nodeId,
          triggerEvent: row.triggerEvent,
          candidateName,
          deadlineAt: row.deadlineAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          status:
            row.deadlineAt && row.deadlineAt.getTime() <= Date.now()
              ? "expired"
              : "pending",
        },
      ];
    } catch {
      // A malformed historical graph must not make the entire inbox fail.
      return [];
    }
  });
}

export async function getWorkflow(input: {
  workspaceId: string;
  id: string;
}): Promise<HydratedWorkflow> {
  return loadHydratedWorkflow(input);
}

export async function createWorkflow(input: {
  workspaceId: string;
  values: WorkflowDefinitionInput;
  createdById: string;
  graph?: import("./definition/schema-v2").WorkflowGraphV2;
  layout?: import("./definition/schema-v2").EditorLayout;
}): Promise<HydratedWorkflow> {
  assertNotDemo();
  return createWorkflowWithDraft(input);
}

export async function updateWorkflow(input: {
  workspaceId: string;
  id: string;
  patch: Partial<WorkflowDefinitionInput>;
  expectedRevision?: number;
  actorId?: string | null;
  graph?: import("./definition/schema-v2").WorkflowGraphV2;
  layout?: import("./definition/schema-v2").EditorLayout;
}): Promise<HydratedWorkflow> {
  assertNotDemo();
  return saveWorkflowDraft(input);
}

export async function deleteWorkflow(input: {
  workspaceId: string;
  id: string;
}): Promise<void> {
  assertNotDemo();
  const [row] = await db
    .update(workflowDefinitions)
    .set({ enabled: false, deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(workflowDefinitions.id, input.id),
        eq(workflowDefinitions.workspaceId, input.workspaceId),
        isNull(workflowDefinitions.deletedAt),
      ),
    )
    .returning({ id: workflowDefinitions.id });
  if (!row) throw ApiError.notFound("Workflow not found.");
  // Runs and steps remain available for audit, support, and retention policies.
}

export async function requestWorkflowApproval(input: {
  workspaceId: string;
  id: string;
  requesterId: string;
  expectedRevision: number;
}): Promise<HydratedWorkflow> {
  assertNotDemo();
  return requestDraftApproval(input);
}

export async function approveWorkflow(input: {
  workspaceId: string;
  id: string;
  approverId: string;
  expectedRevision: number;
}): Promise<HydratedWorkflow> {
  assertNotDemo();
  return approveDraft(input);
}

export async function publishWorkflow(input: {
  workspaceId: string;
  id: string;
  publisherId: string;
  expectedRevision: number;
}): Promise<HydratedWorkflow> {
  assertNotDemo();
  return publishDraft(input);
}

export async function pauseWorkflow(input: {
  workspaceId: string;
  id: string;
}): Promise<WorkflowDefinition> {
  assertNotDemo();
  const [row] = await db
    .update(workflowDefinitions)
    .set({ status: "paused", enabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(workflowDefinitions.id, input.id),
        eq(workflowDefinitions.workspaceId, input.workspaceId),
        eq(workflowDefinitions.status, "published"),
        isNull(workflowDefinitions.deletedAt),
      ),
    )
    .returning();
  if (!row) throw ApiError.conflict("Only a published workflow can be paused.");
  return row;
}

export async function resumeWorkflow(input: {
  workspaceId: string;
  id: string;
}): Promise<WorkflowDefinition> {
  assertNotDemo();
  const [row] = await db
    .update(workflowDefinitions)
    .set({
      status: "published",
      enabled: true,
      consecutiveFailureCount: 0,
      autoPausedAt: null,
      circuitOpenUntil: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowDefinitions.id, input.id),
        eq(workflowDefinitions.workspaceId, input.workspaceId),
        eq(workflowDefinitions.status, "paused"),
        isNull(workflowDefinitions.deletedAt),
      ),
    )
    .returning();
  if (!row) throw ApiError.conflict("Only a paused workflow can be resumed.");
  return row;
}

export async function listWorkflowVersions(input: {
  workspaceId: string;
  workflowId: string;
}): Promise<import("@harly/db").WorkflowDefinitionVersion[]> {
  return db
    .select()
    .from(workflowDefinitionVersions)
    .where(
      and(
        eq(workflowDefinitionVersions.workspaceId, input.workspaceId),
        eq(workflowDefinitionVersions.workflowId, input.workflowId),
      ),
    )
    .orderBy(desc(workflowDefinitionVersions.version));
}

export async function getWorkflowMetrics(input: {
  workspaceId: string;
  workflowId: string;
}) {
  const rows = await db
    .select({
      status: workflowRuns.status,
      total: count(),
      avgDurationMs: avg(workflowRuns.durationMs),
      totalAttempts: sum(workflowRuns.attemptCount),
    })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workspaceId, input.workspaceId),
        eq(workflowRuns.workflowId, input.workflowId),
      ),
    )
    .groupBy(workflowRuns.status);
  const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
  const succeeded = rows.find((row) => row.status === "succeeded")?.total ?? 0;
  const deadLetters =
    rows.find((row) => row.status === "dead_letter")?.total ?? 0;
  const retries = rows.reduce(
    (sum, row) =>
      sum + Math.max(0, Number(row.totalAttempts ?? 0) - Number(row.total)),
    0,
  );
  const weightedDuration = rows.reduce(
    (sum, row) => sum + Number(row.avgDurationMs ?? 0) * Number(row.total),
    0,
  );
  return {
    total,
    succeeded: Number(succeeded),
    failed: Number(rows.find((row) => row.status === "failed")?.total ?? 0),
    running: Number(rows.find((row) => row.status === "running")?.total ?? 0),
    deadLetters: Number(deadLetters),
    retries,
    successRate: total === 0 ? 0 : Number(succeeded) / total,
    averageDurationMs: total === 0 ? 0 : Math.round(weightedDuration / total),
  };
}

export async function rollbackWorkflow(input: {
  workspaceId: string;
  workflowId: string;
  version: number;
  actorId?: string | null;
}): Promise<HydratedWorkflow> {
  assertNotDemo();
  return rollbackVersionToDraft(input);
}

// ---------------------------------------------------------------------------
// Runs + steps (read-only from this layer; the engine writes them)
// ---------------------------------------------------------------------------

export async function listRuns(input: {
  workspaceId: string;
  workflowId?: string;
  limit?: number;
}): Promise<WorkflowRun[]> {
  return db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workspaceId, input.workspaceId),
        input.workflowId
          ? eq(workflowRuns.workflowId, input.workflowId)
          : undefined,
      ),
    )
    .orderBy(desc(workflowRuns.startedAt))
    .limit(Math.max(1, Math.min(input.limit ?? 50, 100)));
}

/** Public API variant with stable, opaque cursor pagination for large histories. */
export async function listRunsPage(input: {
  workspaceId: string;
  workflowId: string;
  limit?: number;
  cursor?: string | null;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const cursor = decodeCursor(input.cursor ?? null);
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  if (cursor && (!cursorDate || Number.isNaN(cursorDate.getTime()))) {
    throw ApiError.badRequest("Invalid `cursor`.");
  }

  const rows = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workspaceId, input.workspaceId),
        eq(workflowRuns.workflowId, input.workflowId),
        cursorDate
          ? or(
              lt(workflowRuns.startedAt, cursorDate),
              and(
                eq(workflowRuns.startedAt, cursorDate),
                lt(workflowRuns.id, cursor!.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(workflowRuns.startedAt), desc(workflowRuns.id))
    .limit(limit + 1);

  return paginate(
    rows,
    limit,
    (row) =>
      ({
        createdAt: row.startedAt.toISOString(),
        id: row.id,
      }) satisfies Cursor,
  );
}

export async function getRun(input: {
  workspaceId: string;
  id: string;
}): Promise<WorkflowRun> {
  const [row] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, input.id),
        eq(workflowRuns.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!row) throw ApiError.notFound("Workflow run not found.");
  return row;
}

export async function listRunSteps(input: {
  workspaceId: string;
  runId: string;
}): Promise<WorkflowRunStep[]> {
  const [run] = await db
    .select({
      engineVersion: workflowRuns.engineVersion,
      versionId: workflowRuns.versionId,
    })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, input.runId),
        eq(workflowRuns.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (run?.engineVersion === 2 && run.versionId) {
    const [version] = await db
      .select({ graph: workflowDefinitionVersions.graph })
      .from(workflowDefinitionVersions)
      .where(
        and(
          eq(workflowDefinitionVersions.id, run.versionId),
          eq(workflowDefinitionVersions.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!version) return [];
    const graph = parseGraph(version.graph);
    const nodeIndexes = new Map(
      graph.nodes.map((node, index) => [node.id, index]),
    );
    const executions = await db
      .select()
      .from(workflowNodeExecutions)
      .where(
        and(
          eq(workflowNodeExecutions.workspaceId, input.workspaceId),
          eq(workflowNodeExecutions.runId, input.runId),
        ),
      )
      .orderBy(workflowNodeExecutions.createdAt);
    const attempts = await db
      .select({ executionId: workflowNodeAttempts.executionId, total: count() })
      .from(workflowNodeAttempts)
      .innerJoin(
        workflowNodeExecutions,
        and(
          eq(workflowNodeExecutions.id, workflowNodeAttempts.executionId),
          eq(workflowNodeExecutions.workspaceId, input.workspaceId),
          eq(workflowNodeExecutions.runId, input.runId),
        ),
      )
      .where(eq(workflowNodeAttempts.workspaceId, input.workspaceId))
      .groupBy(workflowNodeAttempts.executionId);
    const attemptCounts = new Map(
      attempts.map((attempt) => [attempt.executionId, Number(attempt.total)]),
    );
    return executions.map((execution) => {
      const node = graph.nodes.find(
        (candidate) => candidate.id === execution.nodeId,
      );
      return {
        id: execution.id,
        workspaceId: input.workspaceId,
        runId: input.runId,
        nodeId: execution.nodeId,
        stepIndex: nodeIndexes.get(execution.nodeId) ?? null,
        actionType:
          node?.type === "action" ? node.actionType : (node?.type ?? "unknown"),
        actionInput: execution.inputSnapshot ?? {},
        result:
          execution.status === "succeeded"
            ? { success: true, data: execution.output ?? {} }
            : {
                success: false,
                error:
                  execution.errorCode ??
                  execution.waitingKind ??
                  execution.status,
                // Keep v2 diagnostics available through the legacy-shaped
                // timeline response without widening its persisted v1 table.
                errorDetails: execution.errorDetails ?? undefined,
              },
        status: execution.status,
        effectKey: execution.effectKey,
        retryable: execution.retryable,
        attemptCount: attemptCounts.get(execution.id) ?? 0,
        errorCode: execution.errorCode,
        startedAt: execution.startedAt ?? execution.createdAt,
        finishedAt: execution.finishedAt,
      } satisfies WorkflowRunStep & { nodeId: string };
    });
  }

  return db
    .select()
    .from(workflowRunSteps)
    .where(
      and(
        eq(workflowRunSteps.workspaceId, input.workspaceId),
        eq(workflowRunSteps.runId, input.runId),
      ),
    )
    .orderBy(workflowRunSteps.startedAt);
}

export async function requestCancelRun(input: {
  workspaceId: string;
  id: string;
  workflowId?: string;
}): Promise<WorkflowRun> {
  assertNotDemo();
  const [current] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, input.id),
        eq(workflowRuns.workspaceId, input.workspaceId),
        input.workflowId
          ? eq(workflowRuns.workflowId, input.workflowId)
          : undefined,
        eq(workflowRuns.status, "running"),
      ),
    )
    .limit(1);
  if (!current) throw ApiError.conflict("This run is no longer running.");
  if (current.engineVersion === 2) {
    return db.transaction(async (tx) => {
      const now = new Date();
      const terminal = current.logicalStatus !== "running" || !current.lockedBy;
      if (current.logicalStatus === "waiting") {
        await tx
          .update(workflowNodeExecutions)
          .set({
            status: "cancelled",
            waitingKind: null,
            waitingEventName: null,
            waitingResourceId: null,
            waitingResourceType: null,
            finishedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(workflowNodeExecutions.workspaceId, input.workspaceId),
              eq(workflowNodeExecutions.runId, input.id),
              eq(workflowNodeExecutions.status, "waiting"),
            ),
          );
      }
      const [row] = await tx
        .update(workflowRuns)
        .set(
          terminal
            ? {
                status: "cancelled",
                logicalStatus: "cancelled",
                cancelRequestedAt: now,
                cancelledAt: now,
                finishedAt: now,
                lockedAt: null,
                lockedBy: null,
                leaseUntil: null,
                heartbeatAt: null,
                updatedAt: now,
              }
            : { cancelRequestedAt: now, updatedAt: now },
        )
        .where(
          and(
            eq(workflowRuns.id, input.id),
            eq(workflowRuns.workspaceId, input.workspaceId),
            eq(workflowRuns.status, "running"),
          ),
        )
        .returning();
      if (!row)
        throw ApiError.conflict(
          "This run changed while it was being cancelled.",
        );
      return row;
    });
  }
  const [row] = await db
    .update(workflowRuns)
    .set({ cancelRequestedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(workflowRuns.id, input.id),
        eq(workflowRuns.workspaceId, input.workspaceId),
        input.workflowId
          ? eq(workflowRuns.workflowId, input.workflowId)
          : undefined,
        eq(workflowRuns.status, "running"),
      ),
    )
    .returning();
  if (!row) throw ApiError.conflict("This run is no longer running.");
  return row;
}

export async function retryRun(input: {
  workspaceId: string;
  id: string;
  workflowId?: string;
}): Promise<WorkflowRun> {
  assertNotDemo();
  const [current] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, input.id),
        eq(workflowRuns.workspaceId, input.workspaceId),
        input.workflowId
          ? eq(workflowRuns.workflowId, input.workflowId)
          : undefined,
      ),
    )
    .limit(1);
  if (!current) throw ApiError.notFound("Workflow run not found.");
  if (current.engineVersion === 2) {
    return db.transaction(async (tx) => {
      const [failed] = await tx
        .select({ nodeId: workflowNodeExecutions.nodeId })
        .from(workflowNodeExecutions)
        .where(
          and(
            eq(workflowNodeExecutions.workspaceId, input.workspaceId),
            eq(workflowNodeExecutions.runId, input.id),
            eq(workflowNodeExecutions.status, "failed"),
            eq(workflowNodeExecutions.retryable, true),
          ),
        )
        .orderBy(desc(workflowNodeExecutions.finishedAt))
        .limit(1);
      if (!failed)
        throw ApiError.conflict("This run has no retryable failed step.");
      const [row] = await tx
        .update(workflowRuns)
        .set({
          status: "running",
          logicalStatus: "queued",
          retryNodeId: failed.nodeId,
          nextAttemptAt: sql`clock_timestamp()`,
          cancelRequestedAt: null,
          cancelledAt: null,
          deadLetteredAt: null,
          finishedAt: null,
          lockedAt: null,
          lockedBy: null,
          leaseUntil: null,
          heartbeatAt: null,
          error: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowRuns.id, input.id),
            eq(workflowRuns.workspaceId, input.workspaceId),
            eq(workflowRuns.engineVersion, 2),
            eq(workflowRuns.logicalStatus, "failed"),
          ),
        )
        .returning();
      if (!row) throw ApiError.conflict("Only failed v2 runs can be retried.");
      return row;
    });
  }
  const [row] = await db
    .update(workflowRuns)
    .set({
      status: "running",
      nextAttemptAt: new Date(),
      cancelRequestedAt: null,
      cancelledAt: null,
      deadLetteredAt: null,
      finishedAt: null,
      lockedAt: null,
      lockedBy: null,
      heartbeatAt: null,
      error: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRuns.id, input.id),
        eq(workflowRuns.workspaceId, input.workspaceId),
        input.workflowId
          ? eq(workflowRuns.workflowId, input.workflowId)
          : undefined,
        or(
          eq(workflowRuns.status, "failed"),
          eq(workflowRuns.status, "dead_letter"),
        ),
      ),
    )
    .returning();
  if (!row) throw ApiError.conflict("Only failed runs can be retried.");
  return row;
}

export async function replayRunFromStep(input: {
  workspaceId: string;
  id: string;
  stepIndex: number;
  database?: typeof db;
}): Promise<WorkflowRun> {
  assertNotDemo();
  const database = input.database ?? db;
  if (!Number.isInteger(input.stepIndex) || input.stepIndex < 0) {
    throw ApiError.badRequest("Invalid step index.");
  }
  const [source] = await database
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, input.id),
        eq(workflowRuns.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!source) throw ApiError.notFound("Workflow run not found.");

  if (source.engineVersion === 2) {
    if (!source.versionId)
      throw ApiError.conflict(
        "This v2 run has no immutable graph version to replay.",
      );
    const [version] = await database
      .select({
        graph: workflowDefinitionVersions.graph,
        schemaVersion: workflowDefinitionVersions.schemaVersion,
        publishedAt: workflowDefinitionVersions.publishedAt,
      })
      .from(workflowDefinitionVersions)
      .where(
        and(
          eq(workflowDefinitionVersions.id, source.versionId),
          eq(workflowDefinitionVersions.workspaceId, input.workspaceId),
          eq(workflowDefinitionVersions.workflowId, source.workflowId),
        ),
      )
      .limit(1);
    if (!version || version.schemaVersion !== 2 || !version.publishedAt) {
      throw ApiError.conflict("The immutable v2 graph version is unavailable.");
    }
    const graph = parseGraph(version.graph);
    const target = graph.nodes[input.stepIndex];
    if (!target || target.type === "trigger" || target.type === "end") {
      throw ApiError.badRequest("Choose an executable graph node to replay.");
    }
    const compiled = compileGraph(graph);
    if (!compiled.ok)
      throw ApiError.conflict("The published graph is no longer executable.");
    const context = jsonValueSchema.safeParse(
      source.contextSnapshot ?? source.triggerPayload,
    );
    if (!context.success || context.data === null) {
      throw ApiError.conflict(
        "This run has no valid context snapshot to replay.",
      );
    }

    const prerequisiteIds = (compiled.plan.dominators[target.id] ?? []).filter(
      (nodeId) => nodeId !== graph.entryNodeId && nodeId !== target.id,
    );
    const prerequisiteExecutions =
      prerequisiteIds.length === 0
        ? []
        : await database
            .select()
            .from(workflowNodeExecutions)
            .where(
              and(
                eq(workflowNodeExecutions.workspaceId, input.workspaceId),
                eq(workflowNodeExecutions.runId, source.id),
                inArray(workflowNodeExecutions.nodeId, prerequisiteIds),
              ),
            );
    const byNodeId = new Map(
      prerequisiteExecutions.map((execution) => [execution.nodeId, execution]),
    );
    const missingPrerequisites = prerequisiteIds.filter(
      (nodeId) => byNodeId.get(nodeId)?.status !== "succeeded",
    );
    if (missingPrerequisites.length > 0) {
      throw ApiError.conflict(
        "Replay cannot start here because a required earlier node did not complete.",
      );
    }

    return database.transaction(async (tx) => {
      const [row] = await tx
        .insert(workflowRuns)
        .values({
          workspaceId: source.workspaceId,
          workflowId: source.workflowId,
          triggerEvent: source.triggerEvent,
          triggerPayload: source.triggerPayload,
          definitionVersion: source.definitionVersion,
          definitionSnapshot: source.definitionSnapshot,
          status: "running",
          engineVersion: 2,
          versionId: source.versionId,
          logicalStatus: "queued",
          cursorNodeId: target.id,
          contextSnapshot: context.data,
          startStepIndex: input.stepIndex,
          replayOfRunId: source.id,
          parentRunId: source.id,
          sourceEventId: null,
          nextAttemptAt: sql`clock_timestamp()`,
        })
        .returning();
      if (!row) throw ApiError.internal("Replay could not be created.");

      for (const previous of prerequisiteExecutions) {
        const [execution] = await tx
          .insert(workflowNodeExecutions)
          .values({
            workspaceId: row.workspaceId,
            runId: row.id,
            nodeId: previous.nodeId,
            status: "succeeded",
            inputSnapshot: previous.inputSnapshot,
            output: previous.output,
            resolvedPort: previous.resolvedPort,
            effectKey: `workflow:${row.id}:node:${previous.nodeId}`,
            startedAt: previous.startedAt,
            finishedAt: previous.finishedAt,
          })
          .returning({ id: workflowNodeExecutions.id });
        if (!execution)
          throw ApiError.internal("Replay evidence could not be copied.");
        await tx.insert(workflowNodeAttempts).values({
          workspaceId: row.workspaceId,
          executionId: execution.id,
          attemptNo: 1,
          fenceToken: 1,
          status: "succeeded",
          startedAt: previous.startedAt ?? new Date(),
          finishedAt: previous.finishedAt ?? new Date(),
        });
      }
      return row;
    });
  }

  const snapshot = source.definitionSnapshot as { actions?: unknown[] } | null;
  if (input.stepIndex >= (snapshot?.actions?.length ?? 0)) {
    throw ApiError.badRequest("Step index is outside the workflow definition.");
  }

  const [row] = await database
    .insert(workflowRuns)
    .values({
      workspaceId: source.workspaceId,
      workflowId: source.workflowId,
      triggerEvent: source.triggerEvent,
      triggerPayload: source.triggerPayload,
      definitionVersion: source.definitionVersion,
      definitionSnapshot: source.definitionSnapshot,
      status: "running",
      startStepIndex: input.stepIndex,
      replayOfRunId: source.id,
      parentRunId: source.id,
      sourceEventId: null,
    })
    .returning();
  if (!row) throw ApiError.internal("Replay could not be created.");
  return row;
}
