import "server-only";

import { and, asc, count, desc, eq, gte, gt, inArray, isNull, lte, lt, or } from "drizzle-orm";

import {
  db,
  domainEventOutbox,
  workflowDefinitions,
  workflowRuns,
} from "@harly/db";

import { createLogger } from "@/lib/logger";
import type { WebhookEvent } from "@/server/webhooks/events";

import { isWorkflowEvent, WORKFLOW_EVENTS, type WorkflowEvent } from "./schema";
import { runWorkflow } from "./engine";
import { matchesTriggerFilter } from "./conditions";
import { AUTOMATIONS_ENABLED } from "./status";

const log = createLogger("automations");

/**
 * Workflow trigger dispatch (§2.3). Called from emitWebhookEvent on EVERY
 * emitted domain event: finds enabled workflows whose `triggerEvent` matches
 * and whose `trigger.filter` passes against the payload, inserts a
 * `workflow_runs` row (status='running'), and kicks off execution best-effort
 * (decision D3 — same pattern as notifyChatEvent).
 *
 * The run row is inserted BEFORE execution is launched, so a crashed process
 * leaves a reclaimable 'running' row (trade-off T3 — the cron reclaims these).
 *
 * Anti-loop (FASE 2.4): when an action of a running workflow emits an event
 * that would re-trigger the same workflow, we skip it. We detect this by
 * looking for a recent 'running' run of the same workflow started within the
 * last 30 seconds from a parent run — a tight window that catches direct
 * re-entrance without blocking legitimate independent runs.
 */

const ANTI_LOOP_WINDOW_MS = 30_000;
const WORKFLOW_LEASE_MS = 5 * 60_000;
const WORKFLOW_RETRY_DELAY_MS = 60_000;

export type WorkflowDispatchOptions = {
  /** Durable domain-event identity. Duplicate deliveries become no-ops. */
  sourceEventId?: string;
  parentRunId?: string | null;
};

export async function dispatchWorkflowEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  options: WorkflowDispatchOptions = {},
): Promise<boolean> {
  if (!AUTOMATIONS_ENABLED) return true;

  // Only a subset of webhook events are valid workflow triggers.
  if (!isWorkflowEvent(event)) return true;

  const triggerEvent = event as WorkflowEvent;

  let workflows: Array<{
    id: string;
    trigger: unknown;
    definitionVersion: number;
    name: string;
    description: string | null;
    conditions: unknown;
    actions: unknown;
    createdById: string | null;
    maxRunsPerMinute: number;
    maxExternalActionsPerMinute: number;
    circuitBreakerThreshold: number;
    circuitBreakerCooldownSeconds: number;
    circuitOpenUntil: Date | null;
  }>;
  try {
    workflows = await db
      .select({
        id: workflowDefinitions.id,
        trigger: workflowDefinitions.trigger,
        definitionVersion: workflowDefinitions.definitionVersion,
        name: workflowDefinitions.name,
        description: workflowDefinitions.description,
        conditions: workflowDefinitions.conditions,
        actions: workflowDefinitions.actions,
        createdById: workflowDefinitions.createdById,
        maxRunsPerMinute: workflowDefinitions.maxRunsPerMinute,
        maxExternalActionsPerMinute: workflowDefinitions.maxExternalActionsPerMinute,
        circuitBreakerThreshold: workflowDefinitions.circuitBreakerThreshold,
        circuitBreakerCooldownSeconds: workflowDefinitions.circuitBreakerCooldownSeconds,
        circuitOpenUntil: workflowDefinitions.circuitOpenUntil,
      })
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.workspaceId, workspaceId),
          eq(workflowDefinitions.enabled, true),
          eq(workflowDefinitions.status, "published"),
          eq(workflowDefinitions.triggerEvent, triggerEvent),
          isNull(workflowDefinitions.deletedAt),
        ),
      );
  } catch (error) {
    log.error(error, "[automations] dispatch lookup failed", { workspaceId, event });
    return false;
  }

  if (workflows.length === 0) return true;

  for (const workflow of workflows) {
    const trigger = workflow.trigger as { filter?: Record<string, unknown> } | null;
    // Cheap filter check BEFORE creating the run row — avoid noise for
    // workflows scoped to a specific job/stage that this event doesn't match.
    if (trigger?.filter && !matchesTriggerFilter(trigger.filter, data)) {
      continue;
    }

    // Anti-loop: if this workflow has a very recent running run from the same
    // trigger, skip. This catches the case where an action (e.g. move_stage)
    // emits application.stage_changed which re-triggers the same workflow.
    const reentrant = options.parentRunId
      ? await hasChildRun(workspaceId, workflow.id, triggerEvent, options.parentRunId)
      : await hasRecentRunningRun(workspaceId, workflow.id, triggerEvent, data);
    if (reentrant) {
      log.warn(
        { workspaceId, workflowId: workflow.id, event },
        "[automations] anti-loop: skipping re-entrant run",
      );
      continue;
    }

    const deferUntil = await getRunDeferUntil(workspaceId, workflow);

    try {
      const [run] = await db
        .insert(workflowRuns)
        .values({
          workspaceId,
          workflowId: workflow.id,
          triggerEvent,
          triggerPayload: data,
          definitionVersion: workflow.definitionVersion,
          definitionSnapshot: {
            name: workflow.name,
            description: workflow.description,
            trigger: workflow.trigger,
            conditions: workflow.conditions,
            actions: workflow.actions,
            createdById: workflow.createdById,
            maxRunsPerMinute: workflow.maxRunsPerMinute,
            maxExternalActionsPerMinute: workflow.maxExternalActionsPerMinute,
            circuitBreakerThreshold: workflow.circuitBreakerThreshold,
            circuitBreakerCooldownSeconds: workflow.circuitBreakerCooldownSeconds,
            circuitOpenUntil: workflow.circuitOpenUntil,
          },
          sourceEventId: options.sourceEventId ?? null,
          status: "running",
          parentRunId: options.parentRunId ?? null,
          nextAttemptAt: deferUntil ?? new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: workflowRuns.id });

      if (!run) continue;

      // Best-effort execution; the run row is the safety net. A crash here
      // leaves the row 'running' for the cron to reclaim (T3).
      if (deferUntil) continue;
      void runWorkflow(run.id).catch((error) => {
        log.error(error, "[automations] runWorkflow failed", {
          workspaceId,
          workflowId: workflow.id,
          runId: run.id,
        });
      });
    } catch (error) {
      log.error(error, "[automations] create run failed", {
        workspaceId,
        workflowId: workflow.id,
        event,
      });
    }
  }
  return true;
}

async function getRunDeferUntil(
  workspaceId: string,
  workflow: { id: string; maxRunsPerMinute: number; circuitOpenUntil: Date | null },
): Promise<Date | null> {
  const now = new Date();
  if (workflow.circuitOpenUntil && workflow.circuitOpenUntil > now) return workflow.circuitOpenUntil;
  try {
    const [recent] = await db
      .select({ total: count() })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.workspaceId, workspaceId),
          eq(workflowRuns.workflowId, workflow.id),
          gte(workflowRuns.startedAt, new Date(now.getTime() - 60_000)),
        ),
      );
    if (Number(recent?.total ?? 0) >= workflow.maxRunsPerMinute) {
      return new Date(now.getTime() + 15_000);
    }
  } catch (error) {
    log.error(error, "[automations] rate-limit check failed");
  }
  return null;
}

/** Deterministic loop guard for events emitted by a workflow action. */
async function hasChildRun(
  workspaceId: string,
  workflowId: string,
  triggerEvent: WorkflowEvent,
  parentRunId: string,
): Promise<boolean> {
  try {
    const [child] = await db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.workspaceId, workspaceId),
          eq(workflowRuns.workflowId, workflowId),
          eq(workflowRuns.triggerEvent, triggerEvent),
          eq(workflowRuns.parentRunId, parentRunId),
        ),
      )
      .limit(1);
    return Boolean(child);
  } catch (error) {
    log.error(error, "[automations] parent loop check failed");
    return false;
  }
}

/**
 * Reconcile the durable domain-event log into workflow runs. The synchronous
 * event hook is only an accelerator; this consumer is the correctness path
 * after a process crash between committing an event and inserting a run.
 * `workflow_runs(workspace_id, workflow_id, source_event_id)` provides the
 * idempotent boundary when this job overlaps with the fast path.
 */
export async function dispatchWorkflowEventsFromOutbox(batchSize = 100): Promise<{
  processed: number;
  failed: number;
}> {
  if (!AUTOMATIONS_ENABLED) return { processed: 0, failed: 0 };

  const rows = await db
    .select()
    .from(domainEventOutbox)
    .where(
      and(
        isNull(domainEventOutbox.automationsDispatchedAt),
        inArray(domainEventOutbox.eventName, [...WORKFLOW_EVENTS]),
      ),
    )
    .orderBy(asc(domainEventOutbox.createdAt))
    .limit(batchSize);

  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    const event = row.eventName as WebhookEvent;
    const ok = await dispatchWorkflowEvent(row.workspaceId, event, row.payload as Record<string, unknown>, {
      sourceEventId: row.eventId,
      parentRunId: row.automationParentRunId,
    });
    if (!ok) {
      failed += 1;
      await db
        .update(domainEventOutbox)
        .set({
          automationAttempts: row.automationAttempts + 1,
          automationLastError: "Workflow dispatch failed; will retry.",
        })
        .where(eq(domainEventOutbox.id, row.id));
      continue;
    }
    await db
      .update(domainEventOutbox)
      .set({ automationsDispatchedAt: new Date(), automationLastError: null })
      .where(
        and(
          eq(domainEventOutbox.id, row.id),
          isNull(domainEventOutbox.automationsDispatchedAt),
        ),
      );
    processed += 1;
  }
  return { processed, failed };
}

/**
 * Anti-loop detector: true when the same workflow has a 'running' run for this
 * event started within the anti-loop window. The window is tight (30s) so it
 * only catches direct re-entrance, not independent runs minutes apart.
 */
async function hasRecentRunningRun(
  workspaceId: string,
  workflowId: string,
  triggerEvent: WorkflowEvent,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const since = new Date(Date.now() - ANTI_LOOP_WINDOW_MS);
  try {
    const recent = await db
      .select({ id: workflowRuns.id, triggerPayload: workflowRuns.triggerPayload })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.workspaceId, workspaceId),
          eq(workflowRuns.workflowId, workflowId),
          eq(workflowRuns.triggerEvent, triggerEvent),
          eq(workflowRuns.status, "running"),
          gt(workflowRuns.startedAt, since),
        ),
      )
      .orderBy(desc(workflowRuns.startedAt))
      .limit(1);
    if (recent.length === 0) return false;
    const identity = (value: Record<string, unknown>) =>
      ["application", "candidate", "job", "interview"]
        .map((key) => {
          const nested = value[key];
          return typeof nested === "object" && nested && "id" in nested
            ? `${key}:${String((nested as { id: unknown }).id)}`
            : null;
        })
        .concat(
          ["applicationId", "candidateId", "jobId", "interviewId"].map((key) =>
            typeof value[key] === "string" ? `${key}:${value[key]}` : null,
          ),
        )
        .filter((value): value is string => Boolean(value));
    const currentIdentity = identity(payload);
    // A running action that emits the same event for the same aggregate is a
    // loop; an event for another candidate/application remains independent.
    return recent.some((run) => {
      const previousIdentity = identity((run.triggerPayload ?? {}) as Record<string, unknown>);
      return currentIdentity.length === 0 || previousIdentity.some((value) => currentIdentity.includes(value));
    });
  } catch (error) {
    log.error(error, "[automations] anti-loop check failed");
    // On check failure, fail open (don't block) but we'd rather drop a loop
    // than silently kill all automation runs.
    return false;
  }
}

/**
 * Reclaim stalled runs (T3). A 'running' run whose startedAt is older than the
 * threshold either crashed or was orphaned. Mark it failed so it stops
 * blocking the anti-loop detector, then it can be replayed manually.
 *
 * Called by the webhooks cron route alongside dispatchDueWebhooks.
 */
const STALLED_RUN_THRESHOLD_MS = 5 * 60_000;

export async function reclaimStalledWorkflowRuns(): Promise<{
  reclaimed: number;
  deadLettered: number;
}> {
  const cutoff = new Date(Date.now() - STALLED_RUN_THRESHOLD_MS);
  const stale = await db
    .select({
      id: workflowRuns.id,
      attemptCount: workflowRuns.attemptCount,
      maxAttempts: workflowRuns.maxAttempts,
    })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.status, "running"),
        lt(workflowRuns.startedAt, cutoff),
        lte(workflowRuns.nextAttemptAt, new Date()),
        or(isNull(workflowRuns.lockedAt), lt(workflowRuns.lockedAt, cutoff)),
      ),
    )
    .limit(100);

  let reclaimed = 0;
  let deadLettered = 0;
  for (const run of stale) {
    const exhausted = run.attemptCount >= run.maxAttempts;
    const [updated] = await db
      .update(workflowRuns)
      .set({
        status: exhausted ? "dead_letter" : "running",
        finishedAt: exhausted ? new Date() : null,
        error: exhausted
          ? "Run exhausted its retry budget after becoming stale."
          : "Run lease expired; queued for retry.",
        nextAttemptAt: exhausted
          ? new Date()
          : new Date(Date.now() + WORKFLOW_RETRY_DELAY_MS),
        lockedAt: null,
        lockedBy: null,
        heartbeatAt: null,
        deadLetteredAt: exhausted ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowRuns.id, run.id),
          eq(workflowRuns.status, "running"),
          lt(workflowRuns.startedAt, cutoff),
          lte(workflowRuns.nextAttemptAt, new Date()),
        ),
      )
      .returning({ id: workflowRuns.id });
    if (!updated) continue;
    reclaimed += 1;
    if (exhausted) deadLettered += 1;
  }

  return { reclaimed, deadLettered };
}

/**
 * Pick due runs without claiming them. `runWorkflow` performs the atomic
 * lease claim, so multiple scheduler replicas can safely call this function.
 */
export async function dispatchDueWorkflowRuns(limit = 50): Promise<{
  queued: number;
}> {
  const now = new Date();
  try {
    const due = await db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.status, "running"),
          lte(workflowRuns.nextAttemptAt, now),
          or(
            isNull(workflowRuns.lockedAt),
            lt(workflowRuns.lockedAt, new Date(now.getTime() - WORKFLOW_LEASE_MS)),
          ),
        ),
      )
      .orderBy(workflowRuns.nextAttemptAt)
      .limit(limit);
    await Promise.allSettled(due.map(({ id }) => runWorkflow(id)));
    return { queued: due.length };
  } catch (error) {
    log.error(error, "[automations] dispatch due runs failed");
    return { queued: 0 };
  }
}
