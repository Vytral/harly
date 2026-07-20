import "server-only";

import { and, desc, eq, gt, lt } from "drizzle-orm";

import { db, workflowDefinitions, workflowRuns } from "@harly/db";

import { createLogger } from "@/lib/logger";
import type { WebhookEvent } from "@/server/webhooks/events";

import { isWorkflowEvent, type WorkflowEvent } from "./schema";
import { runWorkflow } from "./engine";
import { matchesTriggerFilter } from "./conditions";

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

export async function dispatchWorkflowEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  // Only a subset of webhook events are valid workflow triggers.
  if (!isWorkflowEvent(event)) return;

  const triggerEvent = event as WorkflowEvent;

  let workflows: Array<{
    id: string;
    trigger: unknown;
  }>;
  try {
    workflows = await db
      .select({ id: workflowDefinitions.id, trigger: workflowDefinitions.trigger })
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.workspaceId, workspaceId),
          eq(workflowDefinitions.enabled, true),
          eq(workflowDefinitions.triggerEvent, triggerEvent),
        ),
      );
  } catch (error) {
    log.error(error, "[automations] dispatch lookup failed", { workspaceId, event });
    return;
  }

  if (workflows.length === 0) return;

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
    if (await hasRecentRunningRun(workspaceId, workflow.id, triggerEvent)) {
      log.warn(
        { workspaceId, workflowId: workflow.id, event },
        "[automations] anti-loop: skipping re-entrant run",
      );
      continue;
    }

    try {
      const [run] = await db
        .insert(workflowRuns)
        .values({
          workspaceId,
          workflowId: workflow.id,
          triggerEvent,
          triggerPayload: data,
          status: "running",
        })
        .returning({ id: workflowRuns.id });

      if (!run) continue;

      // Best-effort execution; the run row is the safety net. A crash here
      // leaves the row 'running' for the cron to reclaim (T3).
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
): Promise<boolean> {
  const since = new Date(Date.now() - ANTI_LOOP_WINDOW_MS);
  try {
    const recent = await db
      .select({ id: workflowRuns.id })
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
    // The window check: a run still 'running' after 30s is either in progress
    // (legit) or stalled (the cron will reclaim it). Either way, re-entering
    // now would be a loop — skip.
    return true;
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

export async function reclaimStalledWorkflowRuns(): Promise<{ reclaimed: number }> {
  const cutoff = new Date(Date.now() - STALLED_RUN_THRESHOLD_MS);
  try {
    const stalled = await db
      .update(workflowRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: "Run stalled (process did not complete).",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowRuns.status, "running"),
          lt(workflowRuns.startedAt, cutoff),
        ),
      )
      .returning({ id: workflowRuns.id });

    return { reclaimed: stalled.length };
  } catch (error) {
    log.error(error, "[automations] reclaim stalled runs failed");
    return { reclaimed: 0 };
  }
}
