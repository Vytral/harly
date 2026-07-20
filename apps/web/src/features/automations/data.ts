import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { ApiError } from "@harly/api";
import {
  db,
  workflowDefinitions,
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
    actionType: step.actionType,
    actionInput: step.actionInput,
    result: step.result,
    status: step.status,
    startedAt: step.startedAt.toISOString(),
    finishedAt: step.finishedAt?.toISOString() ?? null,
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
} {
  // Each field is validated independently so a bad `conditions` tree surfaces a
  // precise error rather than a generic "invalid workflow". The schemas are the
  // same ones the builder UI and the AI tool use — single source of truth.
  const trigger = triggerSchema.parse(input.trigger);
  const conditions = conditionsSchema.parse(input.conditions ?? []);
  const actions = actionsSchema.parse(input.actions);

  return {
    name: input.name,
    description: input.description ?? null,
    enabled: input.enabled ?? true,
    trigger,
    triggerEvent: trigger.event,
    conditions,
    actions,
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
    .where(eq(workflowDefinitions.workspaceId, workspaceId))
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

  const [row] = await db
    .insert(workflowDefinitions)
    .values({
      workspaceId: input.workspaceId,
      name: parsed.name,
      description: parsed.description,
      enabled: parsed.enabled,
      triggerEvent: parsed.triggerEvent,
      trigger: parsed.trigger,
      conditions: parsed.conditions,
      actions: parsed.actions,
      createdById: input.createdById,
    })
    .returning();

  if (!row) throw ApiError.internal("Workflow could not be created.");
  return row;
}

export async function updateWorkflow(input: {
  workspaceId: string;
  id: string;
  patch: Partial<WorkflowDefinitionInput>;
}): Promise<WorkflowDefinition> {
  const set: Partial<typeof workflowDefinitions.$inferInsert> = {
    updatedAt: new Date(),
  };

  // Re-validate any field that's being changed. We build a merged shape so the
  // Zod schemas see a complete input (e.g. `conditions` validates on its own,
  // but `actions` cap interacts with the whole list).
  if (input.patch.name !== undefined) set.name = input.patch.name;
  if (input.patch.description !== undefined)
    set.description = input.patch.description ?? null;
  if (input.patch.enabled !== undefined) set.enabled = input.patch.enabled;

  if (input.patch.trigger !== undefined) {
    const trigger = triggerSchema.parse(input.patch.trigger);
    set.trigger = trigger;
    set.triggerEvent = trigger.event;
  }
  if (input.patch.conditions !== undefined) {
    set.conditions = conditionsSchema.parse(input.patch.conditions ?? []);
  }
  if (input.patch.actions !== undefined) {
    set.actions = actionsSchema.parse(input.patch.actions);
  }

  const [row] = await db
    .update(workflowDefinitions)
    .set(set)
    .where(
      and(
        eq(workflowDefinitions.id, input.id),
        eq(workflowDefinitions.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  if (!row) throw ApiError.notFound("Workflow not found.");
  return row;
}

export async function deleteWorkflow(input: {
  workspaceId: string;
  id: string;
}): Promise<void> {
  const [row] = await db
    .delete(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.id, input.id),
        eq(workflowDefinitions.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: workflowDefinitions.id });
  if (!row) throw ApiError.notFound("Workflow not found.");
  // Cascades: workflow_runs + workflow_run_steps are deleted by the FK.
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
    .limit(input.limit ?? 50);
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
