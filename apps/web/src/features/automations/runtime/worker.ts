import "server-only";

import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import {
  db,
  documentRequestPackages,
  documentRequests,
  documents,
  domainEventOutbox,
  member as authMembers,
  workflowApprovalVotes,
  workflowDefinitionVersions,
  workflowNodeAttempts,
  workflowNodeExecutions,
  workflowRuns,
} from "@harly/db";

import {
  evaluateConditions,
  loadConditionContext,
  type ConditionContext,
} from "../conditions";
import {
  getAutomationTool,
  resolveAutomationTarget,
  type ActionContext,
  type ActionResult,
} from "../registry";
import type { WorkflowEvent } from "../schema";
import {
  jsonValueSchema,
  parseGraph,
  type JsonValue,
  type WorkflowNode,
} from "../definition/schema-v2";
import type { AdvanceDecision, NodeOutcome } from "./advance";
import { assertNotDemo } from "@/features/demo/assert-not-demo";
import { graphNodeStore } from "./node-store";
import { graphRunLeases, type RunLease } from "./leases";
import { graphRunStore } from "./run-store";
import { actorHasPermission } from "./workflow-permissions";
import { effectiveApprovalPolicy } from "./approval-policy";
import { nextLocalDeadline } from "./local-time";
import {
  releaseUnstartedExternalActionReservation,
  recordExternalActionOutcome,
  reserveExternalActionPolicy,
  withWorkspaceAutomationEffectPermit,
  workspaceAutomationsEnabled,
} from "./operational-policy";
import {
  recordAutomationGuardDecision,
  recordWorkflowNodeAttempt,
} from "@/server/observability/metrics";

export { nextLocalDeadline } from "./local-time";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;
const DEFAULT_MAX_TRANSITIONS = 256;

export type ActionExecutionRequest = {
  workspaceId: string;
  runId: string;
  workflowId: string;
  actorUserId: string;
  triggerEvent: WorkflowEvent;
  triggerPayload: Record<string, unknown>;
  node: Extract<WorkflowNode, { type: "action" }>;
  input: Record<string, JsonValue>;
  effectKey: string;
  signal: AbortSignal;
};

export type ActionAdapter = {
  /** Provider I/O only. Never called inside a DB transaction. */
  execute(request: ActionExecutionRequest): Promise<NodeOutcome>;
};

export type V2WorkerOptions = {
  database?: typeof db;
  workerId?: string;
  actionAdapter?: ActionAdapter;
  heartbeatIntervalMs?: number;
  maxTransitions?: number;
  allowWaiting?: boolean;
};

export type V2RunOutcome = {
  status:
    | "succeeded"
    | "completed_with_warnings"
    | "stopped"
    | "failed"
    | "uncertain"
    | "cancelled"
    | "retrying"
    | "waiting"
    | "lost"
    | "not_claimed";
  code?: string;
};

function triggerIds(payload: Record<string, unknown>) {
  const application = payload.application as
    | Record<string, unknown>
    | undefined;
  const candidate = payload.candidate as Record<string, unknown> | undefined;
  const interview = payload.interview as Record<string, unknown> | undefined;
  const job = payload.job as Record<string, unknown> | undefined;
  return {
    applicationId:
      (typeof application?.id === "string" && application.id) ||
      (typeof interview?.applicationId === "string" &&
        interview.applicationId) ||
      (typeof payload.applicationId === "string" && payload.applicationId) ||
      null,
    candidateId:
      (typeof candidate?.id === "string" && candidate.id) ||
      (typeof application?.candidateId === "string" &&
        application.candidateId) ||
      (typeof interview?.candidateId === "string" && interview.candidateId) ||
      (typeof payload.candidateId === "string" && payload.candidateId) ||
      null,
    jobId:
      (typeof payload.jobId === "string" && payload.jobId) ||
      (typeof application?.jobId === "string" && application.jobId) ||
      (typeof interview?.jobId === "string" && interview.jobId) ||
      (typeof job?.id === "string" && job.id) ||
      null,
  };
}

function jsonObject(value: JsonValue): Record<string, JsonValue> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function actionErrorDetails(result: ActionResult) {
  const message = result.error
    ?.replace(/(bearer\s+|token=|api[_-]?key=)[^\s,;]+/gi, "$1[redacted]")
    .slice(0, 500);
  return {
    ...(message ? { message } : {}),
    ...(result.errorDetails?.fieldPath
      ? { fieldPath: result.errorDetails.fieldPath }
      : {}),
    category: result.errorDetails?.category ??
      (result.uncertain ? "network" : "unknown"),
    retryAdvice: result.errorDetails?.retryAdvice ??
      (result.uncertain ? "reconcile" : result.retryable ? "after_backoff" : "never"),
  } as const;
}

/** Real production adapter: same registry handlers as legacy engine. */
export function createRegistryActionAdapter(
  database: typeof db = db,
): ActionAdapter {
  return {
    async execute(request) {
      try {
        // Keep registry/domain modules lazy: worker control-plane tests and
        // lease recovery must not initialize session/auth configuration.
        const { getAutomationTool } = await import("../registry");
        const handler = getAutomationTool(
          request.node.actionType,
          request.node.toolVersion,
        );
        if (!handler) {
          return {
            status: "failed",
            code: "UNKNOWN_ACTION_TOOL_VERSION",
          };
        }

        const parsed = handler.schema.safeParse(request.input);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          return {
            status: "failed",
            code: "INVALID_ACTION_INPUT",
            details: {
              message: issue?.message ?? "The action input is invalid.",
              fieldPath: issue?.path.map(String).join(".") || undefined,
              category: "validation",
              retryAdvice: "fix_configuration",
            },
          };
        }

        if (handler.requiresPermission) {
          const allowed = await actorHasPermission(
            database,
            request.workspaceId,
            request.actorUserId,
            handler.requiresPermission,
          );
          if (!allowed.ok)
            return {
              status: "failed",
              code: "ACTOR_NOT_AUTHORIZED",
              details: {
                message: "The workflow actor no longer has the required permission.",
                category: "authorization",
                retryAdvice: "never",
              },
            };
        }

        const resolvedTarget = await resolveAutomationTarget({
          workspaceId: request.workspaceId,
          database,
          payload: request.triggerPayload,
          actionInput: parsed.data as Record<string, unknown>,
          targetFields: handler.targetFields,
        });
        if (!resolvedTarget.ok) {
          return {
            status: "failed",
            code: "INVALID_ACTION_TARGET",
            details: {
              message: resolvedTarget.message,
              fieldPath: resolvedTarget.fieldPath,
              category: "validation",
              retryAdvice: "fix_configuration",
            },
          };
        }

        const context: ActionContext = {
          workspaceId: request.workspaceId,
          database,
          actorUserId: request.actorUserId,
          triggerEvent: request.triggerEvent,
          triggerPayload: request.triggerPayload,
          effectKey: request.effectKey,
          runId: request.runId,
          workflowId: request.workflowId,
          signal: request.signal,
          target: resolvedTarget.target,
        };

        const result = await handler.run(parsed.data, context);
        if (result.success) {
          const output = jsonValueSchema.safeParse(result.data ?? {});
          if (!output.success) {
            return {
              status: "failed",
              code: "INVALID_ACTION_OUTPUT",
              details: {
                message: "The action returned a non-JSON output.",
                category: "configuration",
                retryAdvice: "fix_configuration",
              },
            };
          }
          const contract = handler.outputSchema.safeParse(output.data);
          if (!contract.success) {
            const issue = contract.error.issues[0];
            return {
              status: "failed",
              code: "ACTION_OUTPUT_CONTRACT_VIOLATION",
              details: {
                message: issue?.message ?? "The action output did not satisfy its versioned contract.",
                fieldPath: issue?.path.map(String).join(".") || undefined,
                category: "configuration",
                retryAdvice: "fix_configuration",
              },
            };
          }
          return {
            status: "succeeded",
            output: output.data,
            providerRef:
              result.providerRef ??
              (typeof result.data?.providerRef === "string"
                ? result.data.providerRef
                : typeof result.data?.provider === "string"
                  ? result.data.provider
                  : typeof result.data?.id === "string"
                    ? result.data.id
                    : undefined),
          };
        }
        if (result.uncertain) {
          return {
            status: "uncertain",
            code: result.errorCode ?? "EXTERNAL_EFFECT_UNCERTAIN",
            providerRef: result.providerRef,
            details: actionErrorDetails(result),
          };
        }
        return {
          status: "failed",
          code: result.errorCode ?? "ACTION_FAILED",
          retryable: result.retryable ?? false,
          providerRef: result.providerRef,
          details: actionErrorDetails(result),
        };
      } catch {
        // Registry handlers normalize provider failures before reaching this
        // boundary. An unexpected throw here is therefore treated as a
        // retryable control-plane failure (for example a transient DB read);
        // provider adapters must return `uncertain` explicitly after I/O.
        return { status: "failed", code: "ACTION_THROW", retryable: true };
      }
    },
  };
}

async function loadRunContext(database: typeof db, runId: string) {
  const [row] = await database
    .select({ run: workflowRuns, version: workflowDefinitionVersions })
    .from(workflowRuns)
    .innerJoin(
      workflowDefinitionVersions,
      and(
        eq(workflowDefinitionVersions.id, workflowRuns.versionId),
        eq(workflowDefinitionVersions.workspaceId, workflowRuns.workspaceId),
        eq(workflowDefinitionVersions.workflowId, workflowRuns.workflowId),
      ),
    )
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.engineVersion, 2)))
    .limit(1);
  return row ?? null;
}

/**
 * `loadRunContext` is intentionally a discovery read and can precede another
 * resolver by a few milliseconds. Once this worker owns the fence, read the
 * current logical status before deciding whether to park the run again; a
 * stale `waiting` snapshot must never overwrite a resolver's queued state.
 */
async function loadClaimedLogicalStatus(
  database: typeof db,
  lease: RunLease,
): Promise<string | null> {
  const [row] = await database
    .select({ logicalStatus: workflowRuns.logicalStatus })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, lease.runId),
        eq(workflowRuns.workspaceId, lease.workspaceId),
        eq(workflowRuns.engineVersion, 2),
        eq(workflowRuns.lockedBy, lease.workerId),
        eq(workflowRuns.fenceToken, lease.fenceToken),
      ),
    )
    .limit(1);
  return row?.logicalStatus ?? null;
}

async function evaluateCondition(
  database: typeof db,
  workspaceId: string,
  payload: Record<string, unknown>,
  tree: Parameters<typeof evaluateConditions>[0],
): Promise<{ matched: boolean }> {
  const ids = triggerIds(payload);
  const context: ConditionContext = await loadConditionContext({
    workspaceId,
    applicationId: ids.applicationId,
    candidateId: ids.candidateId,
    jobId: ids.jobId,
    trigger: payload,
    database,
  });
  const result = evaluateConditions(tree, context);
  return { matched: result.matched };
}

function retryDelay(attemptCount: number): number {
  const delays = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];
  return delays[Math.min(Math.max(0, attemptCount - 1), delays.length - 1)]!;
}

function waitDeadline(
  node: Extract<WorkflowNode, { type: "delay" | "approval" | "wait" }>,
): Date {
  if (node.type === "delay") {
    if (node.mode === "next_local")
      return nextLocalDeadline(node.localTime, node.timeZone);
    return new Date(Date.now() + Math.max(0, node.durationMs ?? 0));
  }
  const hours = node.deadlineHours ?? (node.type === "approval" ? 48 : 24 * 90);
  return new Date(Date.now() + hours * 60 * 60_000);
}

async function processWait(
  database: typeof db,
  lease: RunLease,
  decision: Extract<AdvanceDecision, { type: "wait" }>,
): Promise<"waiting" | "continue" | "failed"> {
  const store = graphNodeStore(database);
  const input: Record<string, JsonValue> =
    decision.node.type === "approval"
      ? {
          eligibleActorIds: [...decision.node.eligibleActorIds],
          rule: decision.node.rule,
        }
      : decision.resourceId
        ? { resourceId: decision.resourceId }
        : {};
  const deadlineAt = waitDeadline(decision.node);
  const registration = await store.registerWait(
    lease,
    decision.node.id,
    input,
    {
      kind:
        decision.node.type === "wait" ? decision.node.kind : decision.node.type,
      eventName:
        decision.node.type === "wait" ? decision.node.eventName : undefined,
      resourceId: decision.resourceId,
      resourceType:
        decision.node.type === "wait" &&
        decision.node.kind === "document_package"
          ? decision.node.resourceType
          : undefined,
      deadlineAt,
    },
  );
  if (registration.status === "rejected") return "failed";
  if (registration.status === "continue") return "continue";
  if (decision.node.type === "wait" && decision.node.kind === "event") {
    try {
      await reconcileMissedWorkflowEventWaits(database, {
        workspaceId: lease.workspaceId,
        runId: lease.runId,
        limit: 100,
      });
    } catch {
      // The durable scheduler repeats this reconciliation. A transient
      // outbox read must not turn a correctly registered wait into failure.
    }
  }
  return "waiting";
}

async function processCondition(
  database: typeof db,
  lease: RunLease,
  node: Extract<WorkflowNode, { type: "condition" }>,
  payload: Record<string, unknown>,
  retry: boolean,
) {
  type ConditionResult =
    | { type: "rejected" }
    | { type: "existing" }
    | { type: "settled"; outcome: NodeOutcome; attemptNo: number };
  const store = graphNodeStore(database);
  const reservation = await store.reserve(lease, node.id, {}, { retry });
  if (!reservation) return { type: "rejected" } satisfies ConditionResult;
  if (reservation.kind === "existing")
    return { type: "existing" } satisfies ConditionResult;

  let outcome: NodeOutcome;
  try {
    const result = await evaluateCondition(
      database,
      lease.workspaceId,
      payload,
      node.tree,
    );
    outcome = {
      status: "succeeded",
      output: result,
      port: result.matched ? "true" : "false",
    };
  } catch {
    // Condition context reads are DB-backed. Treat failures as retryable so a
    // transient outage cannot strand the run in `running` until lease expiry.
    // Invalid graph/configuration is still bounded by the run's maxAttempts.
    outcome = {
      status: "failed",
      code: "CONDITION_EVALUATION_FAILED",
      retryable: true,
    };
  }

  const settled = await store.settle(
    reservationLease(lease),
    reservation.execution.id,
    reservation.attemptId,
    outcome,
  );
  return settled
    ? ({
        type: "settled",
        outcome,
        attemptNo: reservation.attemptNo,
      } satisfies ConditionResult)
    : ({ type: "rejected" } satisfies ConditionResult);
}

// Keep helper explicit: it documents that reservation and settlement share
// exactly same fenced lease; no worker-local mutation is hidden here.
function reservationLease(lease: RunLease): RunLease {
  return lease;
}

/**
 * Productive v2 driver. Claim -> reconcile stale attempts -> advance one
 * decision at a time. DB transactions contain only state transitions; action
 * adapters run outside them and every write is fenced.
 */
export async function runWorkflowV2(
  runId: string,
  options: V2WorkerOptions = {},
): Promise<V2RunOutcome> {
  assertNotDemo();
  const database = options.database ?? db;
  const context = await loadRunContext(database, runId);
  if (!context) return { status: "not_claimed", code: "V2_RUN_NOT_FOUND" };

  const workerId = options.workerId ?? `workflow-v2:${randomUUID()}`;
  const leases = graphRunLeases(database);
  const lease = await leases.claim(
    {
      workspaceId: context.run.workspaceId,
      runId,
      workerId,
    },
    { allowWaiting: options.allowWaiting, allowCancellation: true },
  );
  if (!lease) return { status: "not_claimed", code: "V2_RUN_ALREADY_LEASED" };

  const runStore = graphRunStore(database);
  const nodeStore = graphNodeStore(database);
  const adapter =
    options.actionAdapter ?? createRegistryActionAdapter(database);
  const abort = new AbortController();
  let leaseLost = false;
  const heartbeatMs = Math.max(
    1_000,
    options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
  );
  const heartbeat = setInterval(() => {
    void leases
      .renew(lease)
      .then((ok) => {
        if (!ok) {
          leaseLost = true;
          abort.abort("WORKER_LEASE_LOST");
        }
      })
      .catch(() => {
        leaseLost = true;
        abort.abort("WORKER_HEARTBEAT_FAILED");
      });
  }, heartbeatMs);

  try {
    await nodeStore.reconcileStale(lease);
    const claimedLogicalStatus = await loadClaimedLogicalStatus(
      database,
      lease,
    );
    if (!claimedLogicalStatus)
      return { status: "lost", code: "CLAIMED_RUN_NOT_FOUND" };
    const resumed = await nodeStore.resumeDue(lease);
    if (
      claimedLogicalStatus === "waiting" &&
      !resumed &&
      !options.allowWaiting
    ) {
      await leases.release(lease, "waiting");
      return { status: "waiting", code: "WAITING_FOR_RESOLUTION" };
    }
    const maxTransitions = Math.max(
      1,
      options.maxTransitions ?? DEFAULT_MAX_TRANSITIONS,
    );

    for (let transition = 0; transition < maxTransitions; transition += 1) {
      if (leaseLost || abort.signal.aborted)
        return { status: "lost", code: "LEASE_LOST" };
      if (
        !lease.cancellationOnly &&
        !(await workspaceAutomationsEnabled(lease.workspaceId, database))
      ) {
        recordAutomationGuardDecision("WORKSPACE_PAUSED");
        await leases.deferPaused(lease);
        return { status: "waiting", code: "WORKSPACE_PAUSED" };
      }
      const decision = await runStore.advance(lease);
      if (!decision) return { status: "lost", code: "LEASE_LOST" };
      if (decision.type === "finish")
        return { status: decision.status, code: decision.code };
      if (decision.type === "next") continue;

      if (decision.type === "wait") {
        const waitResult = await processWait(database, lease, decision);
        if (waitResult === "waiting") return { status: "waiting" };
        if (waitResult === "failed")
          return { status: "lost", code: "WAIT_COMMIT_REJECTED" };
        continue;
      }

      if (decision.type === "condition") {
        const conditionResult = await processCondition(
          database,
          lease,
          decision.node,
          context.run.triggerPayload as Record<string, unknown>,
          context.run.retryNodeId === decision.node.id,
        );
        if (conditionResult.type === "rejected")
          return { status: "lost", code: "CONDITION_COMMIT_REJECTED" };
        if (
          conditionResult.type === "settled" &&
          conditionResult.outcome.status === "failed" &&
          conditionResult.outcome.retryable &&
          conditionResult.attemptNo < context.run.maxAttempts
        ) {
          const scheduled = await runStore.scheduleRetry(
            lease,
            retryDelay(conditionResult.attemptNo),
            conditionResult.outcome.code,
          );
          return scheduled
            ? { status: "retrying", code: conditionResult.outcome.code }
            : { status: "lost", code: "CONDITION_RETRY_COMMIT_REJECTED" };
        }
        continue;
      }

      const retryingNode = context.run.retryNodeId === decision.node.id;
      const reservation = await nodeStore.reserve(
        lease,
        decision.node.id,
        decision.input,
        { retry: retryingNode },
      );
      if (!reservation) return { status: "lost", code: "RESERVATION_REJECTED" };
      if (reservation.kind === "existing") {
        if (reservation.execution.status === "running") {
          // A prior worker may have died after provider I/O. It is unsafe to
          // repeat this effect; reconciliation above turns old-fence attempts
          // into uncertainty on next worker.
          await nodeStore.reconcileStale(lease);
        }
        continue;
      }

      const actionStartedAt = Date.now();
      let outcome: NodeOutcome;
      const tool = getAutomationTool(
        decision.node.actionType,
        decision.node.toolVersion,
      );
      const isExternal = tool?.effect === "external_write";
      if (isExternal) {
        const policy = await reserveExternalActionPolicy({
          workspaceId: lease.workspaceId,
          workflowId: context.run.workflowId,
          runId,
          database,
        });
        if (!policy.ok) {
          if (
            policy.code === "WORKSPACE_PAUSED" ||
            policy.code === "WORKSPACE_EXTERNAL_RATE_LIMITED"
          ) {
            await nodeStore.releaseUnstarted(
              lease,
              reservation.execution.id,
              reservation.attemptId,
            );
            await leases.deferPaused(
              lease,
              policy.deferUntil ?? new Date(Date.now() + 60_000),
            );
            return { status: "waiting", code: policy.code };
          }
          outcome = { status: "failed", code: policy.code, retryable: false };
        } else {
          try {
            const permit = await withWorkspaceAutomationEffectPermit({
              workspaceId: lease.workspaceId,
              database,
              effect: () => adapter.execute({
                workspaceId: lease.workspaceId,
                runId,
                workflowId: context.run.workflowId,
                actorUserId: context.version.createdById ?? "",
                triggerEvent: context.run.triggerEvent as WorkflowEvent,
                triggerPayload: context.run.triggerPayload as Record<string, unknown>,
                node: decision.node,
                input: jsonObject(reservation.execution.inputSnapshot as JsonValue),
                effectKey: reservation.execution.effectKey,
                signal: abort.signal,
              }),
            });
            if (!permit.started) {
              await releaseUnstartedExternalActionReservation({
                workspaceId: lease.workspaceId,
                workflowId: context.run.workflowId,
                receipt: policy.receipt,
                database,
              });
              await nodeStore.releaseUnstarted(
                lease,
                reservation.execution.id,
                reservation.attemptId,
              );
              recordAutomationGuardDecision("WORKSPACE_PAUSED");
              await leases.deferPaused(lease);
              return { status: "waiting", code: "WORKSPACE_PAUSED" };
            }
            outcome = permit.value;
          } catch {
            outcome = { status: "uncertain", code: "ACTION_ADAPTER_THROW" };
          }
          await recordExternalActionOutcome({
            workspaceId: lease.workspaceId,
            workflowId: context.run.workflowId,
            outcome: outcome.status,
            database,
          });
        }
      } else {
        if (!(await workspaceAutomationsEnabled(lease.workspaceId, database))) {
          await nodeStore.releaseUnstarted(
            lease,
            reservation.execution.id,
            reservation.attemptId,
          );
          recordAutomationGuardDecision("WORKSPACE_PAUSED");
          await leases.deferPaused(lease);
          return { status: "waiting", code: "WORKSPACE_PAUSED" };
        }
        try {
          const permit = await withWorkspaceAutomationEffectPermit({
            workspaceId: lease.workspaceId,
            database,
            effect: () => adapter.execute({
              workspaceId: lease.workspaceId,
              runId,
              workflowId: context.run.workflowId,
              actorUserId: context.version.createdById ?? "",
              triggerEvent: context.run.triggerEvent as WorkflowEvent,
              triggerPayload: context.run.triggerPayload as Record<string, unknown>,
              node: decision.node,
              input: jsonObject(reservation.execution.inputSnapshot as JsonValue),
              effectKey: reservation.execution.effectKey,
              signal: abort.signal,
            }),
          });
          if (!permit.started) {
            await nodeStore.releaseUnstarted(
              lease,
              reservation.execution.id,
              reservation.attemptId,
            );
            recordAutomationGuardDecision("WORKSPACE_PAUSED");
            await leases.deferPaused(lease);
            return { status: "waiting", code: "WORKSPACE_PAUSED" };
          }
          outcome = permit.value;
        } catch {
          // A custom adapter can throw after provider I/O. Treat the result as
          // ambiguous rather than retrying an effect whose outcome is unknown.
          outcome = { status: "uncertain", code: "ACTION_ADAPTER_THROW" };
        }
      }
      recordWorkflowNodeAttempt({
        actionType: decision.node.actionType,
        status: outcome.status,
        durationMs: Date.now() - actionStartedAt,
      });
      if (leaseLost || abort.signal.aborted)
        return { status: "lost", code: "LEASE_LOST_DURING_EFFECT" };
      if (
        !(await nodeStore.settle(
          lease,
          reservation.execution.id,
          reservation.attemptId,
          outcome,
        ))
      ) {
        return { status: "lost", code: "RESULT_COMMIT_REJECTED" };
      }

      // Lease claims also happen while resolving waits and approvals. They
      // are not action attempts, so retry policy must use the durable attempt
      // row for this node instead of the run-level lease counter.
      if (
        outcome.status === "failed" &&
        outcome.retryable &&
        reservation.attemptNo < context.run.maxAttempts
      ) {
        const scheduled = await runStore.scheduleRetry(
          lease,
          retryDelay(reservation.attemptNo),
          outcome.code,
        );
        return scheduled
          ? { status: "retrying", code: outcome.code }
          : { status: "lost", code: "RETRY_COMMIT_REJECTED" };
      }
    }

    const failed = await runStore.fail(lease, "TRANSITION_LIMIT_EXCEEDED");
    return failed
      ? { status: "failed", code: "TRANSITION_LIMIT_EXCEEDED" }
      : { status: "lost", code: "FAILURE_COMMIT_REJECTED" };
  } finally {
    clearInterval(heartbeat);
  }
}

type WaitResolution = {
  workspaceId: string;
  eventName: string;
  payload: Record<string, unknown>;
  resourceId?: string;
};

/**
 * Event waits may be scoped to an earlier action's resource id. Domain event
 * payloads use a few shapes across Harly, so normalize the known identity
 * fields at this boundary instead of letting every producer invent matching
 * logic. Event ids are deliberately excluded: they identify the delivery,
 * not the domain resource that the workflow is waiting for.
 */
function eventResourceIds(payload: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) ids.add(value);
  };
  for (const key of [
    "resourceId",
    "applicationId",
    "candidateId",
    "jobId",
    "interviewId",
    "taskId",
    "offerId",
    "documentId",
    "packageId",
  ])
    add(payload[key]);
  for (const key of [
    "application",
    "candidate",
    "job",
    "interview",
    "task",
    "offer",
    "document",
    "package",
  ]) {
    const value = payload[key];
    if (value && typeof value === "object" && !Array.isArray(value))
      add((value as Record<string, unknown>).id);
  }
  return [...ids];
}

/** Resume event waits through the same fenced path as ordinary workers. */
export async function resumeWorkflowEventWaits(
  input: WaitResolution & { eventSequence?: number },
  database: typeof db = db,
): Promise<number> {
  assertNotDemo();
  const resourceIds = input.resourceId
    ? [input.resourceId]
    : eventResourceIds(input.payload);
  const candidates = await database
    .select({
      runId: workflowRuns.id,
      executionId: workflowNodeExecutions.id,
      waitingResourceId: workflowNodeExecutions.waitingResourceId,
    })
    .from(workflowNodeExecutions)
    .innerJoin(
      workflowRuns,
      and(
        eq(workflowRuns.id, workflowNodeExecutions.runId),
        eq(workflowRuns.workspaceId, workflowNodeExecutions.workspaceId),
      ),
    )
    .where(
      and(
        eq(workflowNodeExecutions.workspaceId, input.workspaceId),
        eq(workflowNodeExecutions.status, "waiting"),
        eq(workflowNodeExecutions.waitingKind, "event"),
        eq(workflowNodeExecutions.waitingEventName, input.eventName),
        eq(workflowRuns.logicalStatus, "waiting"),
        input.eventSequence === undefined
          ? undefined
          : or(
              isNull(workflowNodeExecutions.waitingEventCursor),
              lt(
                workflowNodeExecutions.waitingEventCursor,
                input.eventSequence,
              ),
            ),
      ),
    );

  let resumed = 0;
  for (const candidate of candidates) {
    if (
      candidate.waitingResourceId &&
      (!resourceIds.length ||
        !resourceIds.includes(candidate.waitingResourceId))
    )
      continue;
    const workerId = `event-resolver:${randomUUID()}`;
    const lease = await graphRunLeases(database).claim(
      { workspaceId: input.workspaceId, runId: candidate.runId, workerId },
      { allowWaiting: true },
    );
    if (!lease) continue;
    const resolved = await graphNodeStore(database).resolveWaiting(
      lease,
      candidate.executionId,
      {
        status: "succeeded",
        output: jsonValueSchema.parse(input.payload),
        port: "matched",
      },
    );
    if (!resolved) {
      await graphRunLeases(database).release(lease, "waiting");
      continue;
    }
    await graphRunLeases(database).release(lease, "queued");
    resumed += 1;
    await runWorkflowV2(candidate.runId, { database });
  }
  return resumed;
}

function eventResourceFilter(resourceId: string) {
  const directKeys = [
    "resourceId",
    "applicationId",
    "candidateId",
    "jobId",
    "interviewId",
    "taskId",
    "offerId",
    "documentId",
    "packageId",
  ];
  const direct = directKeys.map(
    (key) => sql`${domainEventOutbox.payload} ->> ${key} = ${resourceId}`,
  );
  const nested = [
    "application",
    "candidate",
    "job",
    "interview",
    "task",
    "offer",
    "document",
    "package",
  ].map(
    (key) =>
      sql`${domainEventOutbox.payload} -> ${key} ->> 'id' = ${resourceId}`,
  );
  return or(...direct, ...nested);
}

/**
 * Recover durable events that committed after a wait captured its outbox
 * cursor, but whose best-effort dispatch happened before the wait row was
 * visible. The same reconciliation runs immediately after registration and
 * from the automation scheduler, so a process restart in that window is safe.
 */
export async function reconcileMissedWorkflowEventWaits(
  database: typeof db = db,
  input: { workspaceId?: string; runId?: string; limit?: number } = {},
): Promise<number> {
  assertNotDemo();
  const waits = await database
    .select({
      workspaceId: workflowNodeExecutions.workspaceId,
      runId: workflowNodeExecutions.runId,
      eventName: workflowNodeExecutions.waitingEventName,
      eventCursor: workflowNodeExecutions.waitingEventCursor,
      resourceId: workflowNodeExecutions.waitingResourceId,
    })
    .from(workflowNodeExecutions)
    .innerJoin(
      workflowRuns,
      and(
        eq(workflowRuns.id, workflowNodeExecutions.runId),
        eq(workflowRuns.workspaceId, workflowNodeExecutions.workspaceId),
      ),
    )
    .where(
      and(
        eq(workflowNodeExecutions.status, "waiting"),
        eq(workflowNodeExecutions.waitingKind, "event"),
        isNotNull(workflowNodeExecutions.waitingEventName),
        isNotNull(workflowNodeExecutions.waitingEventCursor),
        eq(workflowRuns.logicalStatus, "waiting"),
        input.workspaceId
          ? eq(workflowNodeExecutions.workspaceId, input.workspaceId)
          : undefined,
        input.runId ? eq(workflowNodeExecutions.runId, input.runId) : undefined,
      ),
    )
    .orderBy(asc(workflowNodeExecutions.updatedAt))
    .limit(Math.max(1, Math.min(input.limit ?? 100, 500)));

  let resumed = 0;
  for (const wait of waits) {
    if (wait.eventCursor === null || !wait.eventName) continue;
    const [event] = await database
      .select({ id: domainEventOutbox.id, payload: domainEventOutbox.payload })
      .from(domainEventOutbox)
      .where(
        and(
          eq(domainEventOutbox.workspaceId, wait.workspaceId),
          eq(domainEventOutbox.eventName, wait.eventName),
          gt(domainEventOutbox.id, wait.eventCursor),
          wait.resourceId ? eventResourceFilter(wait.resourceId) : undefined,
        ),
      )
      .orderBy(asc(domainEventOutbox.id))
      .limit(1);
    if (
      !event?.payload ||
      typeof event.payload !== "object" ||
      Array.isArray(event.payload)
    )
      continue;
    resumed += await resumeWorkflowEventWaits(
      {
        workspaceId: wait.workspaceId,
        eventName: wait.eventName,
        payload: event.payload as Record<string, unknown>,
        eventSequence: event.id,
      },
      database,
    );
  }
  return resumed;
}

type DocumentPackageState = "completed" | "declined" | "expired" | "cancelled";

/**
 * Reconcile a document-package wait against domain state. The workflow never
 * trusts a client callback as proof: portal requests and signature documents
 * are re-read in the workspace, then the waiting node is resolved under its
 * own fence. A package is complete when all requested uploads are accepted or
 * waived; a decline is an explicit branch so the workflow can ask again or
 * stop. Signature waits use the same node with a document id as resource.
 */
async function documentPackageState(
  database: typeof db,
  workspaceId: string,
  resourceId: string,
  resourceType: "package" | "document" | "legacy" = "legacy",
): Promise<DocumentPackageState | null> {
  if (resourceType === "package" || resourceType === "legacy") {
    const [documentPackage] = await database
      .select({ status: documentRequestPackages.status })
      .from(documentRequestPackages)
      .where(
        and(
          eq(documentRequestPackages.workspaceId, workspaceId),
          sql`${documentRequestPackages.id}::text = ${resourceId}`,
        ),
      )
      .limit(1);
    if (documentPackage) {
      return ["completed", "declined", "expired", "cancelled"].includes(
        documentPackage.status,
      )
        ? (documentPackage.status as DocumentPackageState)
        : null;
    }

    // Legacy waits used applicationId directly. Keep them reconcilable while
    // new request_documents actions use packageId.
    const requests = await database
      .select({ status: documentRequests.status })
      .from(documentRequests)
      .where(
        and(
          eq(documentRequests.workspaceId, workspaceId),
          eq(documentRequests.applicationId, resourceId),
        ),
      );
    if (requests.length > 0) {
      if (requests.some((request) => request.status === "declined"))
        return "declined";
      return requests.every(
        (request) =>
          request.status === "accepted" || request.status === "waived",
      )
        ? "completed"
        : null;
    }
  }

  const [document] = await database
    .select({ signatureStatus: documents.signatureStatus })
    .from(documents)
    .where(
      and(eq(documents.workspaceId, workspaceId), eq(documents.id, resourceId)),
    )
    .limit(1);
  if (!document) return null;
  if (document.signatureStatus === "expired") return "expired";
  if (document.signatureStatus === "declined") return "declined";
  return document.signatureStatus === "signed" ? "completed" : null;
}

/** Reconcile portal uploads or signature completion into document waits. */
export async function resumeWorkflowDocumentWaits(
  input: { workspaceId: string; resourceId?: string },
  database: typeof db = db,
): Promise<number> {
  assertNotDemo();
  const candidates = await database
    .select({
      runId: workflowRuns.id,
      executionId: workflowNodeExecutions.id,
      waitingResourceId: workflowNodeExecutions.waitingResourceId,
      waitingResourceType: workflowNodeExecutions.waitingResourceType,
    })
    .from(workflowNodeExecutions)
    .innerJoin(
      workflowRuns,
      and(
        eq(workflowRuns.id, workflowNodeExecutions.runId),
        eq(workflowRuns.workspaceId, workflowNodeExecutions.workspaceId),
      ),
    )
    .where(
      and(
        eq(workflowNodeExecutions.workspaceId, input.workspaceId),
        eq(workflowNodeExecutions.status, "waiting"),
        eq(workflowNodeExecutions.waitingKind, "document_package"),
        eq(workflowRuns.logicalStatus, "waiting"),
      ),
    );

  let resumed = 0;
  for (const candidate of candidates) {
    const resourceId = candidate.waitingResourceId;
    if (!resourceId || (input.resourceId && resourceId !== input.resourceId))
      continue;
    const state = await documentPackageState(
      database,
      input.workspaceId,
      resourceId,
      candidate.waitingResourceType === "document"
        ? "document"
        : candidate.waitingResourceType === "package"
          ? "package"
          : "legacy",
    );
    if (!state) continue;
    const lease = await graphRunLeases(database).claim(
      {
        workspaceId: input.workspaceId,
        runId: candidate.runId,
        workerId: `document-resolver:${randomUUID()}`,
      },
      { allowWaiting: true },
    );
    if (!lease) continue;
    const resolved = await graphNodeStore(database).resolveWaiting(
      lease,
      candidate.executionId,
      {
        status: "succeeded",
        output: { resourceId, state },
        port: state,
      },
    );
    if (!resolved) {
      await graphRunLeases(database).release(lease, "waiting");
      continue;
    }
    await graphRunLeases(database).release(lease, "queued");
    resumed += 1;
    await runWorkflowV2(candidate.runId, { database });
  }
  return resumed;
}

export async function resolveWorkflowApproval(
  input: {
    workspaceId: string;
    actorId: string;
    decision: "approved" | "rejected";
    runId?: string;
    nodeId?: string;
  },
  database: typeof db = db,
): Promise<number> {
  assertNotDemo();
  const candidates = await database
    .select({
      runId: workflowRuns.id,
      executionId: workflowNodeExecutions.id,
      nodeId: workflowNodeExecutions.nodeId,
      deadlineAt: workflowNodeExecutions.deadlineAt,
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
        input.runId ? eq(workflowRuns.id, input.runId) : undefined,
        input.nodeId
          ? eq(workflowNodeExecutions.nodeId, input.nodeId)
          : undefined,
      ),
    );

  let resolved = 0;
  for (const candidate of candidates) {
    // The scheduler may not have observed expiry yet, so enforce the durable
    // deadline at the resolver boundary as well as in the UI.
    if (candidate.deadlineAt && candidate.deadlineAt.getTime() <= Date.now())
      continue;
    const graph = parseGraph(candidate.graph);
    const node = graph.nodes.find(
      (item): item is Extract<WorkflowNode, { type: "approval" }> =>
        item.type === "approval" && item.id === candidate.nodeId,
    );
    if (!node) continue;
    const lease = await graphRunLeases(database).claim(
      {
        workspaceId: input.workspaceId,
        runId: candidate.runId,
        workerId: `approval-resolver:${randomUUID()}`,
      },
      { allowWaiting: true },
    );
    if (!lease) continue;
    // The vote belongs to the currently effective approval round. Keep lease
    // renewal, vote insertion, and threshold evaluation in one short
    // transaction so a lease takeover/reassignment cannot move a vote across
    // rounds between these operations. The execution snapshot is reread after
    // acquiring the lease; the candidate query above is only a discovery
    // query and may be stale by the time this worker wins the fence.
    const voteState = await database.transaction(async (tx) => {
      if (!(await graphRunLeases(tx).renew(lease))) return null;
      const [execution] = await tx
        .select({
          inputSnapshot: workflowNodeExecutions.inputSnapshot,
          deadlineAt: workflowNodeExecutions.deadlineAt,
          now: sql<Date>`clock_timestamp()`,
        })
        .from(workflowNodeExecutions)
        .where(
          and(
            eq(workflowNodeExecutions.workspaceId, input.workspaceId),
            eq(workflowNodeExecutions.id, candidate.executionId),
            eq(workflowNodeExecutions.status, "waiting"),
          ),
        )
        .limit(1);
      if (!execution) return { kind: "stale" as const };
      if (execution.deadlineAt && execution.deadlineAt <= execution.now) {
        return { kind: "expired" as const };
      }
      const policy = effectiveApprovalPolicy(node, execution.inputSnapshot);
      const [member] = await tx
        .select({ userId: authMembers.userId })
        .from(authMembers)
        .where(
          and(
            eq(authMembers.organizationId, input.workspaceId),
            eq(authMembers.userId, input.actorId),
          ),
        )
        .limit(1)
        .for("key share");
      if (!member || !policy.eligibleActorIds.includes(input.actorId)) {
        return { kind: "ineligible" as const };
      }
      await tx
        .insert(workflowApprovalVotes)
        .values({
          workspaceId: input.workspaceId,
          executionId: candidate.executionId,
          actorId: input.actorId,
          decision: input.decision,
        })
        .onConflictDoNothing();
      const votes = await tx
        .select({
          actorId: workflowApprovalVotes.actorId,
          decision: workflowApprovalVotes.decision,
        })
        .from(workflowApprovalVotes)
        .where(
          and(
            eq(workflowApprovalVotes.workspaceId, input.workspaceId),
            eq(workflowApprovalVotes.executionId, candidate.executionId),
          ),
        );
      const rejected = votes.some((item) => item.decision === "rejected");
      const approved =
        policy.rule === "all"
          ? policy.eligibleActorIds.every((actorId) =>
              votes.some(
                (item) =>
                  item.actorId === actorId && item.decision === "approved",
              ),
            )
          : votes.some((item) => item.decision === "approved");
      return { kind: "state" as const, rejected, approved };
    });
    if (!voteState) {
      await graphRunLeases(database).release(lease, "waiting");
      continue;
    }
    if (
      voteState.kind !== "state" ||
      (!voteState.rejected && !voteState.approved)
    ) {
      await graphRunLeases(database).release(lease, "waiting");
      continue;
    }
    const ok = await graphNodeStore(database).resolveWaiting(
      lease,
      candidate.executionId,
      {
        status: "succeeded",
        output: {
          decision: voteState.rejected ? "rejected" : "approved",
          actorId: input.actorId,
        },
        port: voteState.rejected ? "rejected" : "approved",
      },
    );
    if (!ok) {
      await graphRunLeases(database).release(lease, "waiting");
      continue;
    }
    await graphRunLeases(database).release(lease, "queued");
    resolved += 1;
    await runWorkflowV2(candidate.runId, { database });
  }
  return resolved;
}

export type ApprovalReassignmentResult =
  | { ok: true; previousActorIds: string[]; actorIds: string[] }
  | { ok: false; error: string };

/**
 * Replace the effective assignees of one waiting approval without editing the
 * published graph. The run lease fences this control-plane mutation against a
 * concurrent vote or expiry transition; the audit event is written by the
 * authenticated server action after this operation succeeds.
 */
export async function reassignWorkflowApproval(
  input: {
    workspaceId: string;
    actorId: string;
    runId: string;
    nodeId: string;
    actorIds: string[];
  },
  database: typeof db = db,
): Promise<ApprovalReassignmentResult> {
  assertNotDemo();
  const actorIds = [
    ...new Set(input.actorIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (actorIds.length === 0 || actorIds.length > 50) {
    return { ok: false, error: "Choose between one and fifty assignees." };
  }

  const [candidate] = await database
    .select({
      executionId: workflowNodeExecutions.id,
      inputSnapshot: workflowNodeExecutions.inputSnapshot,
      deadlineAt: workflowNodeExecutions.deadlineAt,
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
      workflowDefinitionVersions,
      and(
        eq(workflowDefinitionVersions.id, workflowRuns.versionId),
        eq(workflowDefinitionVersions.workspaceId, workflowRuns.workspaceId),
      ),
    )
    .where(
      and(
        eq(workflowNodeExecutions.workspaceId, input.workspaceId),
        eq(workflowNodeExecutions.runId, input.runId),
        eq(workflowNodeExecutions.nodeId, input.nodeId),
        eq(workflowNodeExecutions.status, "waiting"),
        eq(workflowNodeExecutions.waitingKind, "approval"),
        eq(workflowRuns.logicalStatus, "waiting"),
      ),
    )
    .limit(1);
  if (!candidate)
    return { ok: false, error: "This approval is no longer waiting." };
  if (candidate.deadlineAt && candidate.deadlineAt.getTime() <= Date.now()) {
    return { ok: false, error: "This approval has expired." };
  }

  const graph = parseGraph(candidate.graph);
  const node = graph.nodes.find(
    (item): item is Extract<WorkflowNode, { type: "approval" }> =>
      item.type === "approval" && item.id === input.nodeId,
  );
  if (!node)
    return { ok: false, error: "Approval definition could not be resolved." };
  const lease = await graphRunLeases(database).claim(
    {
      workspaceId: input.workspaceId,
      runId: input.runId,
      workerId: `approval-reassign:${randomUUID()}`,
    },
    { allowWaiting: true },
  );
  if (!lease)
    return {
      ok: false,
      error: "This approval is being updated by another worker.",
    };

  try {
    const result = await database.transaction(async (tx) => {
      if (!(await graphRunLeases(tx).renew(lease)))
        return { kind: "lease_lost" as const };
      const [execution] = await tx
        .select({
          inputSnapshot: workflowNodeExecutions.inputSnapshot,
          deadlineAt: workflowNodeExecutions.deadlineAt,
          now: sql<Date>`clock_timestamp()`,
        })
        .from(workflowNodeExecutions)
        .where(
          and(
            eq(workflowNodeExecutions.id, candidate.executionId),
            eq(workflowNodeExecutions.workspaceId, input.workspaceId),
            eq(workflowNodeExecutions.runId, input.runId),
            eq(workflowNodeExecutions.status, "waiting"),
          ),
        )
        .limit(1);
      if (!execution) return { kind: "stale" as const };
      if (execution.deadlineAt && execution.deadlineAt <= execution.now) {
        return { kind: "expired" as const };
      }
      const currentPolicy = effectiveApprovalPolicy(
        node,
        execution.inputSnapshot,
      );
      const members = await tx
        .select({ userId: authMembers.userId })
        .from(authMembers)
        .where(
          and(
            eq(authMembers.organizationId, input.workspaceId),
            inArray(authMembers.userId, actorIds),
          ),
        )
        .orderBy(authMembers.userId)
        .for("key share");
      if (members.length !== actorIds.length) {
        return { kind: "invalid_members" as const };
      }
      // Reassignment starts a new approval round. Votes belong to the
      // previous effective policy and must not satisfy the replacement policy
      // (including when one of the old reviewers is retained).
      await tx
        .delete(workflowApprovalVotes)
        .where(
          and(
            eq(workflowApprovalVotes.workspaceId, input.workspaceId),
            eq(workflowApprovalVotes.executionId, candidate.executionId),
          ),
        );
      const [row] = await tx
        .update(workflowNodeExecutions)
        .set({
          inputSnapshot: {
            eligibleActorIds: actorIds,
            rule: currentPolicy.rule,
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowNodeExecutions.id, candidate.executionId),
            eq(workflowNodeExecutions.workspaceId, input.workspaceId),
            eq(workflowNodeExecutions.runId, input.runId),
            eq(workflowNodeExecutions.status, "waiting"),
          ),
        )
        .returning({ id: workflowNodeExecutions.id });
      return row
        ? {
            kind: "updated" as const,
            previousActorIds: currentPolicy.eligibleActorIds,
          }
        : { kind: "stale" as const };
    });
    await graphRunLeases(database).release(lease, "waiting");
    if (result.kind === "invalid_members") {
      return {
        ok: false,
        error: "Every assignee must be an active workspace member.",
      };
    }
    if (result.kind === "expired")
      return { ok: false, error: "This approval has expired." };
    if (result.kind !== "updated")
      return {
        ok: false,
        error: "The approval changed before it could be reassigned.",
      };
    return { ok: true, previousActorIds: result.previousActorIds, actorIds };
  } catch (error) {
    await graphRunLeases(database)
      .release(lease, "waiting")
      .catch(() => false);
    throw error;
  }
}

export type UncertainResolutionResult =
  | { ok: true; resumedStatus: V2RunOutcome["status"] }
  | { ok: false; error: string };

/**
 * Resolve an ambiguous external action without invoking its provider again.
 * This is deliberately an operator decision, fenced by the run row lock, and
 * turns the terminal run back into a queued run so the graph can continue from
 * the persisted result. The original attempt remains evidence; its provider
 * reference is updated only with the reference supplied by the reconciler.
 */
export async function resolveWorkflowUncertain(
  input: {
    workspaceId: string;
    runId: string;
    nodeId: string;
    decision: "succeeded" | "failed";
    note: string;
    providerRef?: string;
    output?: JsonValue;
  },
  database: typeof db = db,
): Promise<UncertainResolutionResult> {
  assertNotDemo();
  const note = input.note.trim();
  if (note.length < 3 || note.length > 1_000) {
    return {
      ok: false,
      error: "Add a reconciliation note between 3 and 1,000 characters.",
    };
  }
  const providerRef = input.providerRef?.trim() || null;
  if (providerRef && providerRef.length > 300) {
    return {
      ok: false,
      error: "The provider reference cannot exceed 300 characters.",
    };
  }
  const parsedOutput =
    input.output === undefined
      ? {
          success: true as const,
          data: {
            resolvedBy: "operator",
            note,
            ...(providerRef ? { providerRef } : {}),
          } as JsonValue,
        }
      : jsonValueSchema.safeParse(input.output);
  if (!parsedOutput.success)
    return {
      ok: false,
      error: "The reconciliation output must be valid JSON.",
    };
  if (JSON.stringify(parsedOutput.data).length > 64_000) {
    return { ok: false, error: "The reconciliation output is too large." };
  }

  const resolved = await database.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        execution: workflowNodeExecutions,
        run: workflowRuns,
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
        workflowDefinitionVersions,
        and(
          eq(workflowDefinitionVersions.id, workflowRuns.versionId),
          eq(workflowDefinitionVersions.workspaceId, workflowRuns.workspaceId),
          eq(workflowDefinitionVersions.workflowId, workflowRuns.workflowId),
        ),
      )
      .where(
        and(
          eq(workflowNodeExecutions.workspaceId, input.workspaceId),
          eq(workflowNodeExecutions.runId, input.runId),
          eq(workflowNodeExecutions.nodeId, input.nodeId),
          eq(workflowNodeExecutions.status, "uncertain"),
          eq(workflowRuns.engineVersion, 2),
          eq(workflowRuns.logicalStatus, "uncertain"),
        ),
      )
      .for("update")
      .limit(1);
    if (!candidate)
      return {
        ok: false as const,
        error: "This uncertain run is no longer awaiting reconciliation.",
      };

    const graph = parseGraph(candidate.graph);
    const node = graph.nodes.find((item) => item.id === input.nodeId);
    if (!node || node.type !== "action") {
      return {
        ok: false as const,
        error: "Only uncertain external action nodes can be reconciled here.",
      };
    }

    const [attempt] = await tx
      .select({ id: workflowNodeAttempts.id })
      .from(workflowNodeAttempts)
      .where(
        and(
          eq(workflowNodeAttempts.workspaceId, input.workspaceId),
          eq(workflowNodeAttempts.executionId, candidate.execution.id),
        ),
      )
      .orderBy(desc(workflowNodeAttempts.attemptNo))
      .for("update")
      .limit(1);
    if (!attempt)
      return {
        ok: false as const,
        error: "The uncertain attempt evidence is missing.",
      };

    const now = new Date();
    const resolvedStatus =
      input.decision === "succeeded" ? "succeeded" : "failed";
    const errorCode =
      input.decision === "succeeded" ? null : "OPERATOR_RECONCILIATION_FAILED";
    const [updatedAttempt] = await tx
      .update(workflowNodeAttempts)
      .set({
        status: resolvedStatus,
        errorCode,
        providerRef,
        finishedAt: now,
      })
      .where(
        and(
          eq(workflowNodeAttempts.id, attempt.id),
          eq(workflowNodeAttempts.status, "uncertain"),
        ),
      )
      .returning({ id: workflowNodeAttempts.id });
    if (!updatedAttempt)
      throw new Error(
        "The uncertain attempt changed before reconciliation completed.",
      );
    const [execution] = await tx
      .update(workflowNodeExecutions)
      .set({
        status: resolvedStatus,
        output: input.decision === "succeeded" ? parsedOutput.data : null,
        resolvedPort: input.decision === "succeeded" ? "success" : null,
        errorCode,
        retryable: false,
        finishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(workflowNodeExecutions.id, candidate.execution.id),
          eq(workflowNodeExecutions.status, "uncertain"),
        ),
      )
      .returning({ id: workflowNodeExecutions.id });
    if (!execution)
      throw new Error(
        "The uncertain node changed before reconciliation completed.",
      );

    const [run] = await tx
      .update(workflowRuns)
      .set({
        status: "running",
        logicalStatus: "queued",
        // Use the database clock for queue eligibility. The worker and
        // PostgreSQL can differ by a small amount after a laptop sleep or a
        // container restart; using the application clock here can strand a
        // reconciled run until the next scheduler tick.
        nextAttemptAt: sql`clock_timestamp()`,
        error: null,
        finishedAt: null,
        deadLetteredAt: null,
        lockedBy: null,
        lockedAt: null,
        leaseUntil: null,
        heartbeatAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(workflowRuns.id, input.runId),
          eq(workflowRuns.workspaceId, input.workspaceId),
          eq(workflowRuns.logicalStatus, "uncertain"),
        ),
      )
      .returning({ id: workflowRuns.id });
    if (!run) throw new Error("The run changed before it could be resumed.");
    return { ok: true as const };
  });

  if (!resolved.ok) return resolved;
  const resumed = await runWorkflowV2(input.runId, {
    database,
    workerId: `uncertain-resolver:${randomUUID()}`,
  });
  return { ok: true, resumedStatus: resumed.status };
}
