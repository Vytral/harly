import "server-only";

import { and, eq } from "drizzle-orm";

import {
  db,
  member as authMembers,
  workflowDefinitions,
  workflowRunSteps,
  workflowRuns,
  type WorkflowDefinition,
  type WorkflowRun,
} from "@harly/db";

import { createLogger } from "@/lib/logger";
import { getRolePermissions } from "@/features/workspaces/permissions-server";
import { roleIsAllPowerful } from "@/features/workspaces/permissions";

import {
  evaluateConditions,
  loadConditionContext,
  matchesTriggerFilter,
  type ConditionContext,
  type ConditionsResult,
} from "./conditions";
import { getActionHandler, type ActionContext, type ActionResult } from "./registry";
import {
  conditionsSchema,
  triggerSchema,
  type Action,
  type Conditions,
  type Trigger,
  type WorkflowEvent,
} from "./schema";

const log = createLogger("automations");

/**
 * The workflow engine (§2.5 / §1.3). runWorkflow loads a persisted run, resolves
 * the actor (decision D1: runs as `createdById`), loads the condition context,
 * evaluates the condition tree, and executes the actions sequentially — writing
 * one workflow_run_steps row per action and updating the run status.
 *
 * Dry-run (T5): when dryRun is true, the engine evaluates the condition and
 * simulates the actions (returns what each would do) WITHOUT executing side
 * effects. The condition evaluator is already pure; actions are skipped.
 *
 * Best-effort async: the run row is inserted with status='running' BEFORE this
 * function is invoked (by the dispatcher), so a crashed process leaves a
 * reclaimable row (trade-off T3, same pattern as webhook_deliveries).
 */

export type RunOutcome =
  | { status: "succeeded"; run: WorkflowRun }
  | { status: "failed"; run: WorkflowRun }
  | { status: "skipped"; run: WorkflowRun };

/** Parse the jsonb columns of a definition into typed values. */
function parseDefinitionJson(def: WorkflowDefinition): {
  trigger: Trigger;
  conditions: Conditions;
  actions: Action[];
} {
  const trigger = triggerSchema.parse(def.trigger);
  const conditions = conditionsSchema.parse(def.conditions);
  // Actions: validate shape only; per-action config is validated by the registry.
  const actions = (Array.isArray(def.actions) ? def.actions : []) as unknown as Action[];
  return { trigger, conditions, actions };
}

/**
 * Resolve whether `actorUserId` still holds `permission` in the workspace.
 * Mirrors requirePermission but for an explicit actor (no HTTP session).
 * Returns { ok, reason } so the engine can record a clear error (trade-off T1).
 */
async function actorHasPermission(
  workspaceId: string,
  actorUserId: string,
  permission: string,
): Promise<{ ok: boolean; reason?: string }> {
  const [membership] = await db
    .select({ role: authMembers.role })
    .from(authMembers)
    .where(
      and(
        eq(authMembers.organizationId, workspaceId),
        eq(authMembers.userId, actorUserId),
      ),
    )
    .limit(1);

  if (!membership) {
    return { ok: false, reason: "Workflow creator no longer has access to this workspace." };
  }
  if (roleIsAllPowerful(membership.role)) return { ok: true };

  const perms = await getRolePermissions(workspaceId, membership.role);
  if (!perms.includes(permission as never)) {
    return {
      ok: false,
      reason: `Workflow creator lacks the \`${permission}\` permission.`,
    };
  }
  return { ok: true };
}

function extractTriggerIds(payload: Record<string, unknown>): {
  applicationId: string | null;
  candidateId: string | null;
  jobId: string | null;
} {
  const app = payload.application as Record<string, unknown> | undefined;
  const candidate = payload.candidate as Record<string, unknown> | undefined;
  const applicationId =
    (typeof app?.id === "string" && app.id) ||
    (typeof payload.applicationId === "string" && payload.applicationId) ||
    null;
  const candidateId =
    (typeof candidate?.id === "string" && candidate.id) ||
    (typeof payload.candidateId === "string" && payload.candidateId) ||
    null;
  const jobId =
    (typeof payload.jobId === "string" && payload.jobId) ||
    (typeof app?.jobId === "string" && app.jobId) ||
    null;
  return { applicationId, candidateId, jobId };
}

function containsAutomatedEvaluationCondition(conditions: Conditions): boolean {
  function visit(node: Conditions[number]): boolean {
    if (node.type === "leaf") return node.field.kind === "ai";
    if (node.type === "not") return visit(node.child);
    return node.children.some(visit);
  }
  return conditions.some(visit);
}

/**
 * Execute one action: validate config, check the actor's permission, run the
 * handler, and persist a workflow_run_steps row. Returns the step result.
 */
async function executeAction(
  action: Action,
  index: number,
  runId: string,
  workspaceId: string,
  actionCtx: ActionContext,
): Promise<ActionResult> {
  const handler = getActionHandler(action.type);
  const startedAt = new Date();

  if (!handler) {
    const result: ActionResult = { success: false, error: `Unknown action type: ${action.type}` };
    await db.insert(workflowRunSteps).values({
      workspaceId,
      runId,
      actionType: action.type,
      actionInput: action.config as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      status: "failed",
      startedAt,
      finishedAt: new Date(),
    });
    return result;
  }

  const parsed = handler.schema.safeParse(action.config);
  if (!parsed.success) {
    const result: ActionResult = {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid action config.",
    };
    await db.insert(workflowRunSteps).values({
      workspaceId,
      runId,
      actionType: action.type,
      actionInput: action.config as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      status: "failed",
      startedAt,
      finishedAt: new Date(),
    });
    return result;
  }

  if (handler.requiresPermission) {
    const allowed = await actorHasPermission(workspaceId, actionCtx.actorUserId, handler.requiresPermission);
    if (!allowed.ok) {
      const result: ActionResult = { success: false, error: allowed.reason };
      await db.insert(workflowRunSteps).values({
        workspaceId,
        runId,
        actionType: action.type,
        actionInput: action.config as Record<string, unknown>,
        result: result as unknown as Record<string, unknown>,
        status: "failed",
        startedAt,
        finishedAt: new Date(),
      });
      return result;
    }
  }

  let result: ActionResult;
  try {
    result = await handler.run(parsed.data, actionCtx);
  } catch (error) {
    log.error(error, "[automations] action threw", { actionType: action.type, index });
    result = { success: false, error: "Action failed unexpectedly." };
  }

  await db.insert(workflowRunSteps).values({
    workspaceId,
    runId,
    actionType: action.type,
    actionInput: action.config as Record<string, unknown>,
    result: result as unknown as Record<string, unknown>,
    status: result.success ? "succeeded" : "failed",
    startedAt,
    finishedAt: new Date(),
  });

  return result;
}

export type RunWorkflowOptions = {
  dryRun?: boolean;
};

/**
 * Run a persisted workflow run to completion. The run row must already exist
 * with status='running' (the dispatcher creates it). Updates the row with the
 * final status, condition result, and error message.
 */
export async function runWorkflow(
  runId: string,
  options: RunWorkflowOptions = {},
): Promise<RunOutcome> {
  const { dryRun = false } = options;

  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId))
    .limit(1);
  if (!run) {
    throw new Error(`Workflow run ${runId} not found.`);
  }

  const [definition] = await db
    .select()
    .from(workflowDefinitions)
    .where(eq(workflowDefinitions.id, run.workflowId))
    .limit(1);
  if (!definition) {
    return finishRun(run, "failed", undefined, "Workflow definition was deleted.");
  }

  // The trigger filter is a cheap pre-check the dispatcher should already have
  // done, but re-check defensively in case the run was created out of band.
  const { trigger, conditions, actions } = parseDefinitionJson(definition);
  const payload = (run.triggerPayload ?? {}) as Record<string, unknown>;
  if (!matchesTriggerFilter(trigger.filter, payload)) {
    return finishRun(run, "skipped", { matched: false, evaluated: [] }, "Trigger filter did not match.");
  }

  const ids = extractTriggerIds(payload);
  const ctx: ConditionContext = await loadConditionContext({
    workspaceId: run.workspaceId,
    applicationId: ids.applicationId,
    candidateId: ids.candidateId,
    jobId: ids.jobId,
    trigger: payload,
  });

  const conditionResult: ConditionsResult = evaluateConditions(conditions, ctx);
  await db
    .update(workflowRuns)
    .set({ conditionResult: conditionResult as unknown as Record<string, unknown> })
    .where(eq(workflowRuns.id, runId));

  if (!conditionResult.matched) {
    return finishRun(run, "skipped", conditionResult, "Conditions did not match.");
  }

  if (dryRun) {
    // Simulate: record what each action would do, without side effects.
    return finishRun(run, "succeeded", conditionResult, undefined, {
      dryRun: true,
      plannedActions: actions.map((a) => ({ type: a.type, config: a.config })),
    });
  }

  // Hiring decisions must remain human-owned. A score or recommendation may
  // prioritize work, but it cannot directly reject an applicant through an
  // automation. The guard is deliberately runtime-enforced for workflows
  // created through old APIs or imported JSON as well as the builder.
  const usesEvaluation = containsAutomatedEvaluationCondition(conditions);
  const rejectsAutomatically = actions.some(
    (action) => action.type === "set_status" && action.config.status === "rejected",
  );
  if (
    usesEvaluation &&
    rejectsAutomatically &&
    (ctx.ai?.source === "rules" || ctx.ai?.requiresHumanReview === true)
  ) {
    return finishRun(
      run,
      "failed",
      conditionResult,
      "Automated evaluations cannot reject applicants. Human review is required.",
    );
  }

  const actionCtx: ActionContext = {
    workspaceId: run.workspaceId,
    actorUserId: definition.createdById ?? "",
    triggerEvent: run.triggerEvent as WorkflowEvent,
    triggerPayload: payload,
  };

  if (!actionCtx.actorUserId) {
    return finishRun(run, "failed", conditionResult, "Workflow has no creator (cannot run as anyone).");
  }

  let failedAction: ActionResult | null = null;
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]!;
    const result = await executeAction(action, index, runId, run.workspaceId, actionCtx);
    if (!result.success && !action.continueOnError) {
      failedAction = result;
      break;
    }
  }

  if (failedAction) {
    return finishRun(run, "failed", conditionResult, failedAction.error);
  }
  return finishRun(run, "succeeded", conditionResult);
}

async function finishRun(
  run: WorkflowRun,
  status: "succeeded" | "failed" | "skipped",
  conditionResult: ConditionsResult | undefined,
  error?: string,
  extra?: Record<string, unknown>,
): Promise<RunOutcome> {
  const [updated] = await db
    .update(workflowRuns)
    .set({
      status,
      finishedAt: new Date(),
      error: error ?? null,
      ...(extra
        ? { conditionResult: { ...(conditionResult ?? {}), ...extra } as unknown as Record<string, unknown> }
        : conditionResult
          ? { conditionResult: conditionResult as unknown as Record<string, unknown> }
          : {}),
    })
    .where(eq(workflowRuns.id, run.id))
    .returning();

  return { status, run: updated ?? run };
}

// Exposed for the dispatcher (FASE 2): create a run row and kick off execution
// best-effort, exactly like notifyChatEvent (decision D3).
export async function createRun(input: {
  workspaceId: string;
  workflowId: string;
  triggerEvent: WorkflowEvent;
  triggerPayload: Record<string, unknown>;
  parentRunId?: string | null;
}): Promise<string> {
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workspaceId: input.workspaceId,
      workflowId: input.workflowId,
      triggerEvent: input.triggerEvent,
      triggerPayload: input.triggerPayload,
      status: "running",
      parentRunId: input.parentRunId ?? null,
    })
    .returning({ id: workflowRuns.id });
  if (!run) throw new Error("Failed to create workflow run.");
  return run.id;
}
