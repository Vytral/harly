import "server-only";

import { and, avg, count, desc, eq, isNotNull, isNull, lt, ne, or, sql, sum } from "drizzle-orm";

import {
  ApiError,
  decodeCursor,
  paginate,
  type Cursor,
} from "@harly/api";
import {
  db,
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowRunSteps,
  workflowRuns,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowRunStep,
} from "@harly/db";

import {
  actionsSchema,
  conditionsSchema,
  triggerSchema,
  workflowInputSchema,
  type Action,
  type Conditions,
  type Trigger,
  type WorkflowEvent,
  type WorkflowDefinitionInput,
} from "./schema";

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

export function serializeWorkflow(def: WorkflowDefinition) {
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

export function serializeRunStep(step: WorkflowRunStep) {
  return {
    id: step.id,
    runId: step.runId,
    stepIndex: step.stepIndex,
    actionType: step.actionType,
    actionInput: step.actionInput,
    result: step.result,
    status: step.status,
    startedAt: step.startedAt.toISOString(),
    finishedAt: step.finishedAt?.toISOString() ?? null,
  };
}

export function serializeWorkflowVersion(version: import("@harly/db").WorkflowDefinitionVersion) {
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
// Validation — parse the input through Zod before persisting (§3.4)
// ---------------------------------------------------------------------------

function parseWorkflowInput(input: WorkflowDefinitionInput): {
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: Trigger;
  triggerEvent: WorkflowEvent;
  conditions: Conditions;
  actions: Action[];
  maxRunsPerMinute?: number;
  maxExternalActionsPerMinute?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerCooldownSeconds?: number;
} {
  // Each field is validated independently so a bad `conditions` tree surfaces a
  // precise error rather than a generic "invalid workflow". The schemas are the
  // same ones the builder UI and the AI tool use — single source of truth.
  const parsed = workflowInputSchema.parse(input);
  const trigger = triggerSchema.parse(parsed.trigger);
  const conditions = conditionsSchema.parse(parsed.conditions ?? []);
  const actions = actionsSchema.parse(parsed.actions);

  return {
    name: parsed.name,
    description: parsed.description ?? null,
    enabled: parsed.enabled ?? true,
    trigger,
    triggerEvent: trigger.event,
    conditions,
    actions,
    maxRunsPerMinute: parsed.maxRunsPerMinute,
    maxExternalActionsPerMinute: parsed.maxExternalActionsPerMinute,
    circuitBreakerThreshold: parsed.circuitBreakerThreshold,
    circuitBreakerCooldownSeconds: parsed.circuitBreakerCooldownSeconds,
  };
}

// ---------------------------------------------------------------------------
// Workflow CRUD
// ---------------------------------------------------------------------------

export async function listWorkflows(
  workspaceId: string,
): Promise<WorkflowDefinition[]> {
  return db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.workspaceId, workspaceId),
        isNull(workflowDefinitions.deletedAt),
      ),
    )
    .orderBy(desc(workflowDefinitions.updatedAt));
}

export async function getWorkflow(input: {
  workspaceId: string;
  id: string;
}): Promise<WorkflowDefinition> {
  const [row] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.id, input.id),
        eq(workflowDefinitions.workspaceId, input.workspaceId),
        isNull(workflowDefinitions.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw ApiError.notFound("Workflow not found.");
  return row;
}

export async function createWorkflow(input: {
  workspaceId: string;
  values: WorkflowDefinitionInput;
  createdById: string;
}): Promise<WorkflowDefinition> {
  const parsed = parseWorkflowInput(input.values);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(workflowDefinitions)
      .values({
        workspaceId: input.workspaceId,
        name: parsed.name,
        description: parsed.description,
        // New definitions are drafts. Publishing is an explicit, audited
        // transition and never happens as a side effect of saving.
        enabled: false,
        status: "draft",
        triggerEvent: parsed.triggerEvent,
        trigger: parsed.trigger,
        conditions: parsed.conditions,
        actions: parsed.actions,
        createdById: input.createdById,
        ...(parsed.maxRunsPerMinute !== undefined ? { maxRunsPerMinute: parsed.maxRunsPerMinute } : {}),
        ...(parsed.maxExternalActionsPerMinute !== undefined ? { maxExternalActionsPerMinute: parsed.maxExternalActionsPerMinute } : {}),
        ...(parsed.circuitBreakerThreshold !== undefined ? { circuitBreakerThreshold: parsed.circuitBreakerThreshold } : {}),
        ...(parsed.circuitBreakerCooldownSeconds !== undefined ? { circuitBreakerCooldownSeconds: parsed.circuitBreakerCooldownSeconds } : {}),
      })
      .returning();

    if (!row) throw ApiError.internal("Workflow could not be created.");
    await tx.insert(workflowDefinitionVersions).values({
      workspaceId: row.workspaceId,
      workflowId: row.id,
      version: row.definitionVersion,
      name: row.name,
      description: row.description,
      triggerEvent: row.triggerEvent,
      trigger: row.trigger,
      conditions: row.conditions,
      actions: row.actions,
      createdById: row.createdById,
      maxRunsPerMinute: row.maxRunsPerMinute,
      maxExternalActionsPerMinute: row.maxExternalActionsPerMinute,
      circuitBreakerThreshold: row.circuitBreakerThreshold,
      circuitBreakerCooldownSeconds: row.circuitBreakerCooldownSeconds,
    });
    return row;
  });
}

export async function updateWorkflow(input: {
  workspaceId: string;
  id: string;
  patch: Partial<WorkflowDefinitionInput>;
}): Promise<WorkflowDefinition> {
  const patch = workflowInputSchema.partial().parse(input.patch);
  const set: Partial<typeof workflowDefinitions.$inferInsert> = {
    updatedAt: new Date(),
    // Drizzle accepts SQL expressions in update sets; the cast preserves the
    // inferred insert shape while keeping the increment database-atomic.
    definitionVersion: sql`${workflowDefinitions.definitionVersion} + 1` as unknown as number,
    status: "draft",
    enabled: false,
    approvalRequestedAt: null,
    approvedById: null,
    approvedAt: null,
    publishedById: null,
    publishedAt: null,
  };

  // Re-validate any field that's being changed. We build a merged shape so the
  // Zod schemas see a complete input (e.g. `conditions` validates on its own,
  // but `actions` cap interacts with the whole list).
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined)
    set.description = patch.description ?? null;
  if (patch.enabled !== undefined) set.enabled = patch.enabled;

  if (patch.trigger !== undefined) {
    const trigger = triggerSchema.parse(patch.trigger);
    set.trigger = trigger;
    set.triggerEvent = trigger.event;
  }
  if (patch.conditions !== undefined) {
    set.conditions = conditionsSchema.parse(patch.conditions ?? []);
  }
  if (patch.actions !== undefined) {
    set.actions = actionsSchema.parse(patch.actions);
  }
  if (patch.maxRunsPerMinute !== undefined) set.maxRunsPerMinute = patch.maxRunsPerMinute;
  if (patch.maxExternalActionsPerMinute !== undefined) set.maxExternalActionsPerMinute = patch.maxExternalActionsPerMinute;
  if (patch.circuitBreakerThreshold !== undefined) set.circuitBreakerThreshold = patch.circuitBreakerThreshold;
  if (patch.circuitBreakerCooldownSeconds !== undefined) set.circuitBreakerCooldownSeconds = patch.circuitBreakerCooldownSeconds;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(workflowDefinitions)
      .set(set)
      .where(
        and(
          eq(workflowDefinitions.id, input.id),
          eq(workflowDefinitions.workspaceId, input.workspaceId),
          isNull(workflowDefinitions.deletedAt),
        ),
      )
      .returning();
    if (!row) throw ApiError.notFound("Workflow not found.");
    await tx.insert(workflowDefinitionVersions).values({
      workspaceId: row.workspaceId,
      workflowId: row.id,
      version: row.definitionVersion,
      name: row.name,
      description: row.description,
      triggerEvent: row.triggerEvent,
      trigger: row.trigger,
      conditions: row.conditions,
      actions: row.actions,
      createdById: row.createdById,
      maxRunsPerMinute: row.maxRunsPerMinute,
      maxExternalActionsPerMinute: row.maxExternalActionsPerMinute,
      circuitBreakerThreshold: row.circuitBreakerThreshold,
      circuitBreakerCooldownSeconds: row.circuitBreakerCooldownSeconds,
    });
    return row;
  });
}

export async function deleteWorkflow(input: {
  workspaceId: string;
  id: string;
}): Promise<void> {
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
}): Promise<WorkflowDefinition> {
  const [row] = await db
    .update(workflowDefinitions)
    .set({ approvalRequestedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(workflowDefinitions.id, input.id),
        eq(workflowDefinitions.workspaceId, input.workspaceId),
        eq(workflowDefinitions.status, "draft"),
        isNull(workflowDefinitions.deletedAt),
      ),
    )
    .returning();
  if (!row) throw ApiError.conflict("Only a draft workflow can request approval.");
  return row;
}

export async function approveWorkflow(input: {
  workspaceId: string;
  id: string;
  approverId: string;
}): Promise<WorkflowDefinition> {
  const [row] = await db
    .update(workflowDefinitions)
    .set({ approvedById: input.approverId, approvedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(workflowDefinitions.id, input.id),
        eq(workflowDefinitions.workspaceId, input.workspaceId),
        eq(workflowDefinitions.status, "draft"),
        isNull(workflowDefinitions.deletedAt),
      ),
    )
    .returning();
  if (!row) throw ApiError.conflict("Only a draft workflow can be approved.");
  return row;
}

export async function publishWorkflow(input: {
  workspaceId: string;
  id: string;
  publisherId: string;
}): Promise<WorkflowDefinition> {
  return db.transaction(async (tx) => {
    const publishedAt = new Date();
    const [row] = await tx
      .update(workflowDefinitions)
      .set({
        status: "published",
        enabled: true,
        publishedById: input.publisherId,
        publishedAt,
        updatedAt: publishedAt,
      })
      .where(
        and(
          eq(workflowDefinitions.id, input.id),
          eq(workflowDefinitions.workspaceId, input.workspaceId),
          eq(workflowDefinitions.status, "draft"),
          isNotNull(workflowDefinitions.approvedAt),
          ne(workflowDefinitions.approvedById, input.publisherId),
          isNull(workflowDefinitions.deletedAt),
        ),
      )
      .returning();
    if (!row) throw ApiError.conflict("Workflow needs approval from another member before publishing.");
    await tx
      .update(workflowDefinitionVersions)
      .set({ publishedById: input.publisherId, publishedAt })
      .where(
        and(
          eq(workflowDefinitionVersions.workflowId, row.id),
          eq(workflowDefinitionVersions.version, row.definitionVersion),
        ),
      );
    return row;
  });
}

export async function pauseWorkflow(input: {
  workspaceId: string;
  id: string;
}): Promise<WorkflowDefinition> {
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

export async function resumeWorkflow(input: { workspaceId: string; id: string }): Promise<WorkflowDefinition> {
  const [row] = await db
    .update(workflowDefinitions)
    .set({
      status: "draft",
      enabled: false,
      autoPausedAt: null,
      circuitOpenUntil: null,
      approvalRequestedAt: null,
      approvedById: null,
      approvedAt: null,
      publishedById: null,
      publishedAt: null,
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
    .where(and(eq(workflowRuns.workspaceId, input.workspaceId), eq(workflowRuns.workflowId, input.workflowId)))
    .groupBy(workflowRuns.status);
  const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
  const succeeded = rows.find((row) => row.status === "succeeded")?.total ?? 0;
  const deadLetters = rows.find((row) => row.status === "dead_letter")?.total ?? 0;
  const retries = rows.reduce((sum, row) => sum + Math.max(0, Number(row.totalAttempts ?? 0) - Number(row.total)), 0);
  const weightedDuration = rows.reduce((sum, row) => sum + Number(row.avgDurationMs ?? 0) * Number(row.total), 0);
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
}): Promise<WorkflowDefinition> {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(workflowDefinitionVersions)
      .where(
        and(
          eq(workflowDefinitionVersions.workspaceId, input.workspaceId),
          eq(workflowDefinitionVersions.workflowId, input.workflowId),
          eq(workflowDefinitionVersions.version, input.version),
        ),
      )
      .limit(1);
    if (!source) throw ApiError.notFound("Workflow version not found.");

    const [row] = await tx
      .update(workflowDefinitions)
      .set({
        name: source.name,
        description: source.description,
        triggerEvent: source.triggerEvent,
        trigger: source.trigger,
        conditions: source.conditions,
        actions: source.actions,
        maxRunsPerMinute: source.maxRunsPerMinute,
        maxExternalActionsPerMinute: source.maxExternalActionsPerMinute,
        circuitBreakerThreshold: source.circuitBreakerThreshold,
        circuitBreakerCooldownSeconds: source.circuitBreakerCooldownSeconds,
        status: "draft",
        enabled: false,
        definitionVersion: sql`${workflowDefinitions.definitionVersion} + 1` as unknown as number,
        approvalRequestedAt: null,
        approvedById: null,
        approvedAt: null,
        publishedById: null,
        publishedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowDefinitions.id, input.workflowId),
          eq(workflowDefinitions.workspaceId, input.workspaceId),
          isNull(workflowDefinitions.deletedAt),
        ),
      )
      .returning();
    if (!row) throw ApiError.notFound("Workflow not found.");
    await tx.insert(workflowDefinitionVersions).values({
      workspaceId: row.workspaceId,
      workflowId: row.id,
      version: row.definitionVersion,
      name: row.name,
      description: row.description,
      triggerEvent: row.triggerEvent,
      trigger: row.trigger,
      conditions: row.conditions,
      actions: row.actions,
      createdById: row.createdById,
      maxRunsPerMinute: row.maxRunsPerMinute,
      maxExternalActionsPerMinute: row.maxExternalActionsPerMinute,
      circuitBreakerThreshold: row.circuitBreakerThreshold,
      circuitBreakerCooldownSeconds: row.circuitBreakerCooldownSeconds,
    });
    return row;
  });
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

  return paginate(rows, limit, (row) => ({
    createdAt: row.startedAt.toISOString(),
    id: row.id,
  } satisfies Cursor));
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
  const [row] = await db
    .update(workflowRuns)
    .set({ cancelRequestedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(workflowRuns.id, input.id),
        eq(workflowRuns.workspaceId, input.workspaceId),
        input.workflowId ? eq(workflowRuns.workflowId, input.workflowId) : undefined,
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
        input.workflowId ? eq(workflowRuns.workflowId, input.workflowId) : undefined,
        or(eq(workflowRuns.status, "failed"), eq(workflowRuns.status, "dead_letter")),
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
}): Promise<WorkflowRun> {
  if (!Number.isInteger(input.stepIndex) || input.stepIndex < 0) {
    throw ApiError.badRequest("Invalid step index.");
  }
  const [source] = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, input.id), eq(workflowRuns.workspaceId, input.workspaceId)))
    .limit(1);
  if (!source) throw ApiError.notFound("Workflow run not found.");
  const snapshot = source.definitionSnapshot as { actions?: unknown[] } | null;
  if (input.stepIndex >= (snapshot?.actions?.length ?? 0)) {
    throw ApiError.badRequest("Step index is outside the workflow definition.");
  }

  const [row] = await db
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
