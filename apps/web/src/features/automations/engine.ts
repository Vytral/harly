import "server-only";

import { and, count, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import {
  db,
  member as authMembers,
  workflowDefinitions,
  workflowActionEffects,
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
const RUN_LEASE_MS = 5 * 60_000;

async function claimRun(runId: string, workerId: string): Promise<boolean> {
  const now = new Date();
  const [claimed] = await db
    .update(workflowRuns)
    .set({
      attemptCount: sql`${workflowRuns.attemptCount} + 1`,
      lockedAt: now,
      lockedBy: workerId,
      heartbeatAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.status, "running"),
        lte(workflowRuns.nextAttemptAt, now),
        or(
          isNull(workflowRuns.lockedAt),
          lt(workflowRuns.lockedAt, new Date(now.getTime() - RUN_LEASE_MS)),
        ),
      ),
    )
    .returning({ id: workflowRuns.id });
  return Boolean(claimed);
}

async function heartbeatRun(runId: string, workerId: string): Promise<void> {
  await db
    .update(workflowRuns)
    .set({ heartbeatAt: new Date(), lockedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.status, "running"),
        eq(workflowRuns.lockedBy, workerId),
      ),
    );
}

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
  | { status: "skipped"; run: WorkflowRun }
  | { status: "running"; run: WorkflowRun }
  | { status: "dead_letter"; run: WorkflowRun }
  | { status: "cancelled"; run: WorkflowRun };

/** Parse the jsonb columns of a definition into typed values. */
function parseDefinitionJson(def: WorkflowDefinition | Record<string, unknown>): {
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

const SENSITIVE_LOG_KEYS = /secret|token|password|authorization|cookie|credential|body/i;
const EXTERNAL_ACTION_TYPES = ["send_slack", "send_email", "http_request"] as const;

async function externalActionBudgetExceeded(actionCtx: ActionContext, actionType: string): Promise<boolean> {
  if (!actionCtx.workflowId || !EXTERNAL_ACTION_TYPES.includes(actionType as (typeof EXTERNAL_ACTION_TYPES)[number])) return false;
  const [recent] = await db
    .select({ total: count() })
    .from(workflowRunSteps)
    .innerJoin(workflowRuns, eq(workflowRuns.id, workflowRunSteps.runId))
    .where(
      and(
        eq(workflowRuns.workspaceId, actionCtx.workspaceId),
        eq(workflowRuns.workflowId, actionCtx.workflowId),
        gte(workflowRunSteps.startedAt, new Date(Date.now() - 60_000)),
        inArray(workflowRunSteps.actionType, [...EXTERNAL_ACTION_TYPES]),
      ),
    );
  return Number(recent?.total ?? 0) >= (actionCtx.maxExternalActionsPerMinute ?? 30);
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > 1_000 ? `${value.slice(0, 1_000)}…` : value;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 2 || typeof value !== "object") return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1));
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = SENSITIVE_LOG_KEYS.test(key)
      ? "[REDACTED]"
      : sanitizeLogValue(child, depth + 1);
  }
  return output;
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
  const effectKey = actionCtx.effectKey;
  const [existingEffect] = await db
    .select({ status: workflowActionEffects.status, result: workflowActionEffects.result })
    .from(workflowActionEffects)
    .where(
      and(
        eq(workflowActionEffects.runId, runId),
        eq(workflowActionEffects.stepIndex, index),
      ),
    )
    .limit(1);
  if (existingEffect?.status === "succeeded") {
    const result = existingEffect.result;
    return {
      success: true,
      data:
        result && typeof result === "object" && "data" in result
          ? ((result as { data?: Record<string, unknown> }).data ?? undefined)
          : undefined,
    };
  }

  await db
    .insert(workflowActionEffects)
    .values({
      workspaceId,
      runId,
      stepIndex: index,
      effectKey,
      status: "pending",
    })
    .onConflictDoNothing();

  const [completedStep] = await db
    .select({ status: workflowRunSteps.status, result: workflowRunSteps.result })
    .from(workflowRunSteps)
    .where(
      and(
        eq(workflowRunSteps.runId, runId),
        eq(workflowRunSteps.stepIndex, index),
        eq(workflowRunSteps.status, "succeeded"),
      ),
    )
    .limit(1);
  if (completedStep) {
    return {
      success: true,
      data:
        completedStep.result && typeof completedStep.result === "object"
          ? (completedStep.result as Record<string, unknown>).data as Record<string, unknown> | undefined
          : undefined,
    };
  }

  const handler = getActionHandler(action.type);
  const startedAt = new Date();

  const recordStep = async (result: ActionResult, status: "succeeded" | "failed") => {
    await db
      .insert(workflowRunSteps)
      .values({
        workspaceId,
        runId,
        stepIndex: index,
        actionType: action.type,
        actionInput: sanitizeLogValue(action.config) as Record<string, unknown>,
        result: sanitizeLogValue(result) as Record<string, unknown>,
        status,
        effectKey: actionCtx.effectKey,
        retryable: result.retryable ?? false,
        errorCode: result.errorCode ?? null,
        startedAt,
        finishedAt: new Date(),
      })
      .onConflictDoNothing();
    await db
      .update(workflowActionEffects)
      .set({
        status,
        result: sanitizeLogValue(result) as Record<string, unknown>,
        error: result.error ?? null,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowActionEffects.runId, runId),
          eq(workflowActionEffects.stepIndex, index),
          eq(workflowActionEffects.effectKey, effectKey),
        ),
      );
  };

  if (!handler) {
    const result: ActionResult = { success: false, error: `Unknown action type: ${action.type}` };
    await recordStep(result, "failed");
    return result;
  }

  const parsed = handler.schema.safeParse(action.config);
  if (!parsed.success) {
    const result: ActionResult = {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid action config.",
    };
    await recordStep(result, "failed");
    return result;
  }

  if (handler.requiresPermission) {
    const allowed = await actorHasPermission(workspaceId, actionCtx.actorUserId, handler.requiresPermission);
    if (!allowed.ok) {
      const result: ActionResult = { success: false, error: allowed.reason };
      await recordStep(result, "failed");
      return result;
    }
  }

  if (await externalActionBudgetExceeded(actionCtx, action.type)) {
    const result: ActionResult = {
      success: false,
      error: "External action rate limit exceeded; retrying later.",
      errorCode: "external_rate_limited",
      retryable: true,
    };
    await recordStep(result, "failed");
    return result;
  }

  let result: ActionResult;
  try {
    result = await handler.run(parsed.data, actionCtx);
  } catch (error) {
    log.error(error, "[automations] action threw", { actionType: action.type, index });
    result = {
      success: false,
      error: "Action failed unexpectedly.",
      errorCode: "unexpected_action_error",
      retryable: true,
    };
  }

  await recordStep(result, result.success ? "succeeded" : "failed");

  return result;
}

export type RunWorkflowOptions = {
  dryRun?: boolean;
  workerId?: string;
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
  const workerId = options.workerId ?? `workflow-worker:${randomUUID()}`;

  if (!(await claimRun(runId, workerId))) {
    throw new Error(`Workflow run ${runId} is already leased or not due.`);
  }

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

  const snapshot =
    run.definitionSnapshot &&
    typeof run.definitionSnapshot === "object" &&
    Object.keys(run.definitionSnapshot as Record<string, unknown>).length > 0
      ? (run.definitionSnapshot as Record<string, unknown>)
      : definition;

  // The trigger filter is a cheap pre-check the dispatcher should already have
  // done, but re-check defensively in case the run was created out of band.
  const { trigger, conditions, actions } = parseDefinitionJson(snapshot);
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
    .set({ conditionResult: conditionResult as unknown as Record<string, unknown>, heartbeatAt: new Date() })
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.lockedBy, workerId)));

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
    actorUserId:
      typeof snapshot.createdById === "string"
        ? snapshot.createdById
        : definition.createdById ?? "",
    triggerEvent: run.triggerEvent as WorkflowEvent,
    triggerPayload: payload,
    effectKey: "",
    runId,
    workflowId: run.workflowId,
    maxExternalActionsPerMinute:
      typeof snapshot.maxExternalActionsPerMinute === "number"
        ? snapshot.maxExternalActionsPerMinute
        : definition.maxExternalActionsPerMinute,
  };

  if (!actionCtx.actorUserId) {
    return finishRun(run, "failed", conditionResult, "Workflow has no creator (cannot run as anyone).");
  }

  let failedAction: ActionResult | null = null;
  for (let index = run.startStepIndex ?? 0; index < actions.length; index += 1) {
    const action = actions[index]!;
    const [cancelRequested] = await db
      .select({ cancelRequestedAt: workflowRuns.cancelRequestedAt })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1);
    if (cancelRequested?.cancelRequestedAt) {
      return finishRun({ ...run, lockedBy: workerId }, "cancelled", conditionResult);
    }
    await heartbeatRun(runId, workerId);
    const result = await executeAction(
      action,
      index,
      runId,
      run.workspaceId,
      { ...actionCtx, effectKey: `workflow:${runId}:step:${index}` },
    );
    if (!result.success && !action.continueOnError) {
      failedAction = result;
      break;
    }
  }

  if (failedAction) {
    if (failedAction.retryable && run.attemptCount < run.maxAttempts) {
      return scheduleRetry(run, conditionResult, failedAction);
    }
    if (failedAction.retryable) {
      return finishRun(
        { ...run, lockedBy: workerId },
        "dead_letter",
        conditionResult,
        failedAction.error,
      );
    }
    return finishRun({ ...run, lockedBy: workerId }, "failed", conditionResult, failedAction.error);
  }
  return finishRun({ ...run, lockedBy: workerId }, "succeeded", conditionResult);
}

async function finishRun(
  run: WorkflowRun,
  status: "succeeded" | "failed" | "skipped" | "dead_letter" | "cancelled",
  conditionResult: ConditionsResult | undefined,
  error?: string,
  extra?: Record<string, unknown>,
): Promise<RunOutcome> {
  const finishedAt = new Date();
  const [updated] = await db
    .update(workflowRuns)
    .set({
      status,
      error: error ?? null,
      deadLetteredAt: status === "dead_letter" ? new Date() : null,
      cancelledAt: status === "cancelled" ? new Date() : null,
      finishedAt,
      durationMs: Math.max(0, finishedAt.getTime() - run.startedAt.getTime()),
      lockedAt: null,
      lockedBy: null,
      heartbeatAt: null,
      ...(extra
        ? { conditionResult: { ...(conditionResult ?? {}), ...extra } as unknown as Record<string, unknown> }
        : conditionResult
          ? { conditionResult: conditionResult as unknown as Record<string, unknown> }
          : {}),
    })
    .where(
      run.lockedBy
        ? and(eq(workflowRuns.id, run.id), eq(workflowRuns.lockedBy, run.lockedBy))
        : eq(workflowRuns.id, run.id),
    )
    .returning();

  if (status === "succeeded") {
    await db
      .update(workflowDefinitions)
      .set({ consecutiveFailureCount: 0, autoPausedAt: null, circuitOpenUntil: null, updatedAt: new Date() })
      .where(eq(workflowDefinitions.id, run.workflowId));
  } else if (status === "failed" || status === "dead_letter") {
    const [definitionState] = await db
    .select({
      consecutiveFailureCount: workflowDefinitions.consecutiveFailureCount,
      circuitBreakerThreshold: workflowDefinitions.circuitBreakerThreshold,
      circuitBreakerCooldownSeconds: workflowDefinitions.circuitBreakerCooldownSeconds,
    })
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, run.workflowId))
      .limit(1);
    const failures = (definitionState?.consecutiveFailureCount ?? 0) + 1;
    const shouldPause = failures >= 5;
    const shouldOpenCircuit = failures >= (definitionState?.circuitBreakerThreshold ?? 5);
    const circuitOpenUntil = shouldOpenCircuit
      ? new Date(Date.now() + (definitionState?.circuitBreakerCooldownSeconds ?? 300) * 1000)
      : undefined;
    await db
      .update(workflowDefinitions)
      .set({
        consecutiveFailureCount: failures,
        ...(shouldPause ? { enabled: false, status: "paused" as const, autoPausedAt: new Date() } : {}),
        ...(circuitOpenUntil ? { circuitOpenUntil } : {}),
        updatedAt: new Date(),
      })
      .where(eq(workflowDefinitions.id, run.workflowId));
    if (shouldPause) {
      log.warn(
        { workflowId: run.workflowId, failures },
        "[automations] workflow auto-paused after repeated failures",
      );
    }
  }

  return { status, run: updated ?? run };
}

async function scheduleRetry(
  run: WorkflowRun,
  conditionResult: ConditionsResult,
  failure: ActionResult,
): Promise<RunOutcome> {
  const delayMs = Math.min(
    15 * 60_000,
    60_000 * 2 ** Math.max(0, run.attemptCount - 1),
  );
  const [updated] = await db
    .update(workflowRuns)
    .set({
      status: "running",
      conditionResult: conditionResult as unknown as Record<string, unknown>,
      error: failure.error ?? "Retryable action failed.",
      nextAttemptAt: new Date(Date.now() + delayMs),
      lockedAt: null,
      lockedBy: null,
      heartbeatAt: null,
      updatedAt: new Date(),
    })
    .where(eq(workflowRuns.id, run.id))
    .returning();
  return { status: "running", run: updated ?? run };
}

// Exposed for the dispatcher (FASE 2): create a run row and kick off execution
// best-effort, exactly like notifyChatEvent (decision D3).
export async function createRun(input: {
  workspaceId: string;
  workflowId: string;
  triggerEvent: WorkflowEvent;
  triggerPayload: Record<string, unknown>;
  sourceEventId?: string | null;
  parentRunId?: string | null;
}): Promise<string> {
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workspaceId: input.workspaceId,
      workflowId: input.workflowId,
      triggerEvent: input.triggerEvent,
      triggerPayload: input.triggerPayload,
      sourceEventId: input.sourceEventId ?? null,
      status: "running",
      parentRunId: input.parentRunId ?? null,
    })
    .returning({ id: workflowRuns.id });
  if (!run) throw new Error("Failed to create workflow run.");
  return run.id;
}
