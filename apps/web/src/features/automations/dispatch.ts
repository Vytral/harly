import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  lt,
  or,
  sql,
} from "drizzle-orm";

import {
  db,
  domainEventOutbox,
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowRuns,
} from "@harly/db";

import { createLogger } from "@/lib/logger";
import type { WebhookEvent } from "@/server/webhooks/events";

import { isWorkflowEvent, WORKFLOW_EVENTS, type WorkflowEvent } from "./schema";
import { runWorkflow } from "./engine";
import { resumeWorkflowEventWaits, runWorkflowV2 } from "./runtime/worker";
import { jsonValueSchema, parseGraph } from "./definition/schema-v2";
import { matchesTriggerFilter } from "./conditions";
import { AUTOMATIONS_ENABLED, legacyWorkflowDispatchDisabled } from "./status";
import { findDueWorkflowRuns } from "./runtime/due-runs";
import { reserveRunAdmissionPolicy } from "./runtime/operational-policy";
import { assertNotDemo } from "@/features/demo/assert-not-demo";

const log = createLogger("automations");

/**
 * Workflow trigger dispatch (§2.3). Called from emitWebhookEvent on EVERY
 * emitted domain event: finds enabled workflows whose `triggerEvent` matches
 * and whose `trigger.filter` passes against the payload, inserts a
 * `workflow_runs` row (legacy status='running'; v2 logicalStatus='queued'),
 * and kicks off execution best-effort (decision D3 — same pattern as
 * notifyChatEvent).
 *
 * The run row is inserted BEFORE execution is launched, so a crashed process
 * leaves a reclaimable 'running' row (trade-off T3 — the cron reclaims these).
 *
 * Anti-loop (FASE 2.4): when an action of a running workflow emits an event
 * that would re-trigger the same workflow, we skip it. We detect this by
 * looking for a recent 'running' run of the same workflow started within the
 * last 30 seconds — a tight window that catches direct re-entrance without
 * blocking legitimate independent runs. If the check itself fails (e.g. DB
 * blip), dispatch fails closed: no new run is created and the caller gets
 * false so the durable outbox can retry instead of running blind.
 */

const ANTI_LOOP_WINDOW_MS = 30_000;
const WORKFLOW_RETRY_DELAY_MS = 60_000;
const MAX_LINEAGE_DEPTH = 12;

function scheduleWorkflowRun(
  runId: string,
  meta: Record<string, unknown>,
  engineVersion: number,
  database: typeof db = db,
) {
  const task = () => {
    void (
      engineVersion === 2
        ? runWorkflowV2(runId, { database })
        : runWorkflow(runId)
    ).catch((error) => {
      log.error(error, "[automations] runWorkflow failed", meta);
    });
  };
  try {
    after(task);
  } catch {
    void task();
  }
}

export type WorkflowDispatchOptions = {
  /** Durable domain-event identity. Duplicate deliveries become no-ops. */
  sourceEventId?: string;
  /** Monotonic outbox identity, used to order event-wait registration. */
  sourceEventSequence?: number;
  parentRunId?: string | null;
  /** Explicit database boundary for worker-originated domain events. */
  database?: typeof db;
};

export async function dispatchWorkflowEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  options: WorkflowDispatchOptions = {},
): Promise<boolean> {
  assertNotDemo();
  const database = options.database ?? db;
  if (!AUTOMATIONS_ENABLED) return true;

  // Only a subset of webhook events are valid workflow triggers.
  if (!isWorkflowEvent(event)) return true;

  const triggerEvent = event as WorkflowEvent;

  const parentLineage = options.parentRunId
    ? await loadParentLineage(
        workspaceId,
        options.parentRunId,
        database,
      )
    : null;
  if (options.parentRunId && !parentLineage) {
    log.error(
      new Error("Automation parent run is unavailable"),
      "[automations] refusing to dispatch an untraceable child run",
      { workspaceId, parentRunId: options.parentRunId, event },
    );
    return false;
  }
  if (parentLineage && parentLineage.depth >= MAX_LINEAGE_DEPTH) {
    log.warn(
      { workspaceId, parentRunId: options.parentRunId, event },
      "[automations] lineage depth budget exhausted; event chain stopped",
    );
    return true;
  }

  let sourceEventSequence = options.sourceEventSequence;
  if (sourceEventSequence === undefined && options.sourceEventId) {
    try {
      const [source] = await database
        .select({ id: domainEventOutbox.id })
        .from(domainEventOutbox)
        .where(
          and(
            eq(domainEventOutbox.workspaceId, workspaceId),
            eq(domainEventOutbox.eventId, options.sourceEventId),
          ),
        )
        .limit(1);
      if (typeof source?.id === "number") sourceEventSequence = source.id;
    } catch {
      // The durable scheduler will scan the outbox for event waits even when
      // this best-effort fast-path lookup is unavailable.
    }
  }

  // Event waits are resolved before creating new trigger runs. Each waiter
  // has its own durable fence; a matching event never mutates it directly.
  await resumeWorkflowEventWaits(
    {
      workspaceId,
      eventName: triggerEvent,
      payload: data,
      eventSequence: sourceEventSequence,
    },
    database,
  );

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
    engineVersion: number;
    publishedVersionId: string | null;
  }>;
  try {
    workflows = await database
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
        maxExternalActionsPerMinute:
          workflowDefinitions.maxExternalActionsPerMinute,
        circuitBreakerThreshold: workflowDefinitions.circuitBreakerThreshold,
        circuitBreakerCooldownSeconds:
          workflowDefinitions.circuitBreakerCooldownSeconds,
        circuitOpenUntil: workflowDefinitions.circuitOpenUntil,
        engineVersion: workflowDefinitions.engineVersion,
        publishedVersionId: workflowDefinitions.publishedVersionId,
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
    log.error(error, "[automations] dispatch lookup failed", {
      workspaceId,
      event,
    });
    return false;
  }

  if (workflows.length === 0) return true;

  for (const workflow of workflows) {
    const trigger = workflow.trigger as {
      filter?: Record<string, unknown>;
    } | null;
    // Cheap filter check BEFORE creating the run row — avoid noise for
    // workflows scoped to a specific job/stage that this event doesn't match.
    if (trigger?.filter && !matchesTriggerFilter(trigger.filter, data)) {
      continue;
    }

    // Once the v2 drain switch is enabled, never create another run for the
    // historical linear runner. Returning false keeps the durable outbox row
    // retryable instead of acknowledging an event that still needs migration
    // or an explicit workflow pause.
    if (workflow.engineVersion !== 2 && legacyWorkflowDispatchDisabled()) {
      log.error(
        new Error("Legacy v1 workflow dispatch blocked by drain mode"),
        "[automations] pause or explicitly operate legacy workflow before enabling v2 drain",
        { workspaceId, workflowId: workflow.id },
      );
      return false;
    }

    // Anti-loop: if this workflow has a very recent running run from the same
    // trigger, skip. This catches the case where an action (e.g. move_stage)
    // emits application.stage_changed which re-triggers the same workflow.
    // Check failures are fail-closed: defer the whole dispatch so the durable
    // outbox retries instead of creating a run while loop detection is blind.
    let reentrant: boolean;
    try {
      reentrant = options.parentRunId
        ? await hasChildRun(
            workspaceId,
            workflow.id,
            triggerEvent,
            options.parentRunId,
            database,
          )
        : await hasRecentRunningRun(
            workspaceId,
            workflow.id,
            triggerEvent,
            data,
            database,
          );
    } catch (error) {
      log.error(error, "[automations] anti-loop check failed; deferring dispatch", {
        workspaceId,
        workflowId: workflow.id,
        event,
      });
      return false;
    }
    if (reentrant) {
      log.warn(
        { workspaceId, workflowId: workflow.id, event },
        "[automations] anti-loop: skipping re-entrant run",
      );
      continue;
    }

    let deferUntil: Date | null = null;
    try {
      const admission = await reserveRunAdmissionPolicy({
        workspaceId,
        workflowId: workflow.id,
        maxRunsPerMinute: workflow.maxRunsPerMinute,
        circuitOpenUntil: workflow.circuitOpenUntil,
        database,
      });
      if (!admission.ok) {
        deferUntil = admission.deferUntil;
        log.warn(
          {
            workspaceId,
            workflowId: workflow.id,
            event,
            code: admission.code,
            deferUntil: deferUntil.toISOString(),
          },
          "[automations] run admission deferred (hard quota)",
        );
      }
    } catch (error) {
      log.error(error, "[automations] run admission check failed; deferring dispatch", {
        workspaceId,
        workflowId: workflow.id,
        event,
      });
      return false;
    }
    const sourceEventId =
      options.sourceEventId ??
      (typeof data.eventId === "string" && data.eventId.length > 0
        ? data.eventId
        : null);

    try {
      let v2Version: { id: string; entryNodeId: string } | null = null;
      if (workflow.engineVersion === 2) {
        if (!workflow.publishedVersionId) {
          log.error(
            new Error("Published v2 workflow has no version pointer"),
            "[automations] invalid v2 pointer",
            { workflowId: workflow.id },
          );
          return false;
        }
        const [version] = await database
          .select({
            id: workflowDefinitionVersions.id,
            graph: workflowDefinitionVersions.graph,
            schemaVersion: workflowDefinitionVersions.schemaVersion,
            publishedAt: workflowDefinitionVersions.publishedAt,
          })
          .from(workflowDefinitionVersions)
          .where(
            and(
              eq(workflowDefinitionVersions.id, workflow.publishedVersionId),
              eq(workflowDefinitionVersions.workspaceId, workspaceId),
              eq(workflowDefinitionVersions.workflowId, workflow.id),
            ),
          )
          .limit(1);
        const graph =
          version && version.schemaVersion === 2 && version.publishedAt
            ? parseGraph(version.graph)
            : null;
        if (!version || !graph)
          throw new Error("Published v2 graph is unavailable");
        v2Version = { id: version.id, entryNodeId: graph.entryNodeId };
      }
      const contextSnapshot =
        workflow.engineVersion === 2 ? jsonValueSchema.parse(data) : undefined;
      const runId = randomUUID();
      const [run] = await database
        .insert(workflowRuns)
        .values({
          id: runId,
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
            circuitBreakerCooldownSeconds:
              workflow.circuitBreakerCooldownSeconds,
            circuitOpenUntil: workflow.circuitOpenUntil,
          },
          sourceEventId,
          status: "running",
          ...(workflow.engineVersion === 2 && v2Version
            ? {
                engineVersion: 2,
                versionId: v2Version.id,
                logicalStatus: "queued",
                cursorNodeId: v2Version.entryNodeId,
                contextSnapshot,
              }
            : {}),
          parentRunId: options.parentRunId ?? null,
          rootRunId: parentLineage?.rootRunId ?? runId,
          lineageDepth: parentLineage ? parentLineage.depth + 1 : 0,
          nextAttemptAt: deferUntil ?? sql`clock_timestamp()`,
        })
        .onConflictDoNothing()
        .returning({ id: workflowRuns.id });

      if (!run) continue;

      // Best-effort execution; the run row is the safety net. A crash here
      // leaves the row 'running' for the cron to reclaim (T3).
      if (deferUntil) continue;
      scheduleWorkflowRun(
        run.id,
        {
          workspaceId,
          workflowId: workflow.id,
          runId: run.id,
        },
        workflow.engineVersion,
        database,
      );
    } catch (error) {
      log.error(error, "[automations] create run failed", {
        workspaceId,
        workflowId: workflow.id,
        event,
      });
      return false;
    }
  }
  return true;
}

async function loadParentLineage(
  workspaceId: string,
  parentRunId: string,
  database: typeof db,
): Promise<{ rootRunId: string; depth: number } | null> {
  const [parent] = await database
    .select({
      id: workflowRuns.id,
      rootRunId: workflowRuns.rootRunId,
      depth: workflowRuns.lineageDepth,
    })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workspaceId, workspaceId),
        eq(workflowRuns.id, parentRunId),
      ),
    )
    .limit(1);
  if (!parent) return null;
  return {
    rootRunId: parent.rootRunId ?? parent.id,
    depth: parent.depth,
  };
}


/** Deterministic loop guard for events emitted by a workflow action. */
async function hasChildRun(
  workspaceId: string,
  workflowId: string,
  triggerEvent: WorkflowEvent,
  parentRunId: string,
  database: typeof db = db,
): Promise<boolean> {
  const [child] = await database
    .select({
      id: workflowRuns.id,
      engineVersion: workflowRuns.engineVersion,
    })
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
}

/**
 * Reconcile the durable domain-event log into workflow runs. The synchronous
 * event hook is only an accelerator; this consumer is the correctness path
 * after a process crash between committing an event and inserting a run.
 * `workflow_runs(workspace_id, workflow_id, source_event_id)` provides the
 * idempotent boundary when this job overlaps with the fast path.
 */
export async function dispatchWorkflowEventsFromOutbox(
  batchSize = 100,
): Promise<{
  processed: number;
  failed: number;
}> {
  assertNotDemo();
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
    const ok = await dispatchWorkflowEvent(
      row.workspaceId,
      event,
      row.payload as Record<string, unknown>,
      {
        sourceEventId: row.eventId,
        sourceEventSequence: row.id,
        parentRunId: row.automationParentRunId,
      },
    );
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
 *
 * Errors propagate to the caller. Swallowing them would fail open (create a
 * run while blind to loops); the dispatcher fail-closes by deferring outbox
 * acknowledgement instead.
 */
async function hasRecentRunningRun(
  workspaceId: string,
  workflowId: string,
  triggerEvent: WorkflowEvent,
  payload: Record<string, unknown>,
  database: typeof db = db,
): Promise<boolean> {
  const since = new Date(Date.now() - ANTI_LOOP_WINDOW_MS);
  const recent = await database
    .select({
      id: workflowRuns.id,
      triggerPayload: workflowRuns.triggerPayload,
    })
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
    .limit(5);
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
  if (currentIdentity.length === 0) return false;
  // A running action that emits the same event for the same aggregate is a
  // loop; an event for another candidate/application remains independent.
  return recent.some((run) => {
    const previousIdentity = identity(
      (run.triggerPayload ?? {}) as Record<string, unknown>,
    );
    return previousIdentity.some((value) => currentIdentity.includes(value));
  });
}

/**
 * Reclaim stalled runs (T3). A 'running' run whose startedAt is older than the
 * threshold either crashed or was orphaned. Mark it failed so it stops
 * blocking the anti-loop detector, then it can be replayed manually.
 *
 * Called by the dedicated automations cron route alongside due-run dispatch.
 */
const STALLED_RUN_THRESHOLD_MS = 5 * 60_000;

export async function reclaimStalledWorkflowRuns(): Promise<{
  reclaimed: number;
  deadLettered: number;
}> {
  assertNotDemo();
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
        eq(workflowRuns.engineVersion, 1),
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
          eq(workflowRuns.engineVersion, 1),
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

export async function dispatchDueWorkflowRuns(limit = 50): Promise<{
  queued: number;
}> {
  assertNotDemo();
  // A failed due-queue read is an infrastructure failure, not an empty
  // queue. Let it reach the cron route so the scheduler records a failed run
  // and alerts can fire instead of silently acknowledging a DB outage.
  const due = await findDueWorkflowRuns(db, limit);
  let queued = 0;
  for (const item of due) {
    // Waiting wakes already held an admission slot when first queued; do not
    // charge the per-minute budget again or a busy tenant cannot resume waits.
    const needsAdmission =
      item.engineVersion !== 2 ||
      item.logicalStatus === "queued" ||
      item.logicalStatus === "retrying";
    if (needsAdmission) {
      const [definition] = await db
        .select({
          maxRunsPerMinute: workflowDefinitions.maxRunsPerMinute,
          circuitOpenUntil: workflowDefinitions.circuitOpenUntil,
        })
        .from(workflowDefinitions)
        .where(
          and(
            eq(workflowDefinitions.workspaceId, item.workspaceId),
            eq(workflowDefinitions.id, item.workflowId),
          ),
        )
        .limit(1);
      if (!definition) {
        log.error(
          new Error("Due run workflow definition missing"),
          "[automations] skipping due run without definition",
          { runId: item.id, workflowId: item.workflowId },
        );
        continue;
      }
      let admission;
      try {
        admission = await reserveRunAdmissionPolicy({
          workspaceId: item.workspaceId,
          workflowId: item.workflowId,
          maxRunsPerMinute: definition.maxRunsPerMinute,
          circuitOpenUntil: definition.circuitOpenUntil,
        });
      } catch (error) {
        log.error(error, "[automations] due-run admission check failed", {
          runId: item.id,
        });
        continue;
      }
      if (!admission.ok) {
        await db
          .update(workflowRuns)
          .set({
            nextAttemptAt: admission.deferUntil,
            updatedAt: new Date(),
          })
          .where(eq(workflowRuns.id, item.id));
        log.warn(
          {
            runId: item.id,
            code: admission.code,
            deferUntil: admission.deferUntil.toISOString(),
          },
          "[automations] due run re-deferred (hard quota)",
        );
        continue;
      }
    }
    try {
      if (item.engineVersion === 2) await runWorkflowV2(item.id);
      else await runWorkflow(item.id);
      queued += 1;
    } catch (error) {
      log.error(error, "[automations] due run execution rejected", {
        runId: item.id,
        engineVersion: item.engineVersion,
      });
    }
  }
  return { queued };
}
