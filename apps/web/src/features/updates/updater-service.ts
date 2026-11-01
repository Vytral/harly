import "server-only";

import { and, eq, inArray, asc } from "drizzle-orm";
import { db, updateRequests, workspaceUpdateSettings, type UpdateRequest } from "@harly/db";

import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

import {
  currentVersion,
  hasRecentFailureFor,
  reconcileUpdateRequests,
  recordUpdaterHeartbeat,
  refreshLatestRelease,
} from "./data";
import { autoUpdateAllows } from "./release-version";
import {
  statusesBefore,
  type UpdateStatus,
  type UpdaterReportedStatus,
} from "./update-request-state";
import { isWithinUpdateWindow } from "./update-window";

const log = createLogger("updates");

export type ClaimedRequest = {
  id: string;
  targetVersion: string;
  trigger: "manual" | "auto";
};

const toClaimed = (row: UpdateRequest): ClaimedRequest => ({
  id: row.id,
  targetVersion: row.targetVersion,
  trigger: row.trigger === "auto" ? "auto" : "manual",
});

/**
 * Queues an update on behalf of the auto-update policy when one is due: the
 * policy is on, the release is allowed by its patch/minor level, "now" is inside
 * the owner's window, and this version has not already failed on this host.
 * Returns the request already claimed for the polling updater.
 */
async function queueAutoUpdate(now: Date): Promise<ClaimedRequest | null> {
  const state = await refreshLatestRelease();
  const latest = state?.latestVersion;
  if (!latest) return null;
  const running = currentVersion();

  const policies = await db
    .select()
    .from(workspaceUpdateSettings)
    .where(eq(workspaceUpdateSettings.autoUpdateEnabled, true))
    .orderBy(asc(workspaceUpdateSettings.createdAt));

  for (const policy of policies) {
    const level = policy.autoUpdateLevel === "minor" ? "minor" : "patch";
    if (!autoUpdateAllows(level, running, latest)) continue;
    if (
      !isWithinUpdateWindow(now, {
        days: policy.windowDays,
        startHour: policy.windowStartHour,
        endHour: policy.windowEndHour,
        timezone: policy.windowTimezone,
      })
    ) {
      continue;
    }
    // A version that failed or was rolled back is not retried unattended: an
    // owner has to look at why, then ask for it explicitly.
    if (await hasRecentFailureFor(latest)) continue;

    try {
      const [created] = await db
        .insert(updateRequests)
        .values({
          organizationId: policy.organizationId,
          trigger: "auto",
          fromVersion: running,
          targetVersion: latest,
          status: "claimed",
          message: "Queued by the automatic update window.",
          claimedAt: now,
        })
        .returning();
      if (!created) continue;
      await logAuditEvent({
        workspaceId: policy.organizationId,
        action: "update.auto_requested",
        resourceType: "update_request",
        resourceId: created.id,
        severity: "warning",
        metadata: { fromVersion: running, targetVersion: latest, level },
      });
      return toClaimed(created);
    } catch (error) {
      // The one-active-request index refused it: something else was queued
      // between our check and this insert. That is fine; the next poll sees it.
      log.info({ error: error instanceof Error ? error.message : error }, "auto update not queued");
      return null;
    }
  }
  return null;
}

/**
 * The updater's poll. Always records a heartbeat (that is how the page knows the
 * updater is alive), then hands over the oldest pending request or, failing
 * that, an automatic one that is due. Claiming is a conditional UPDATE, so two
 * updaters can never take the same request.
 */
export async function claimNextRequest(input: {
  updaterVersion: string | null;
  now?: Date;
}): Promise<ClaimedRequest | null> {
  const now = input.now ?? new Date();
  await recordUpdaterHeartbeat(input.updaterVersion);
  await reconcileUpdateRequests(now);

  const [pending] = await db
    .select({ id: updateRequests.id })
    .from(updateRequests)
    .where(eq(updateRequests.status, "pending"))
    .orderBy(asc(updateRequests.createdAt))
    .limit(1);
  if (pending) {
    const [claimed] = await db
      .update(updateRequests)
      .set({ status: "claimed", claimedAt: now, updatedAt: now, message: "Picked up by the updater." })
      .where(and(eq(updateRequests.id, pending.id), eq(updateRequests.status, "pending")))
      .returning();
    if (claimed) return toClaimed(claimed);
  }

  // Nothing queued by hand and nothing already active: consider the policy.
  const [active] = await db
    .select({ id: updateRequests.id })
    .from(updateRequests)
    .where(inArray(updateRequests.status, ["pending", "claimed", "running"]))
    .limit(1);
  return active ? null : queueAutoUpdate(now);
}

export type UpdaterReport = {
  requestId: string;
  status: UpdaterReportedStatus;
  message?: string;
  logTail?: string;
};

const TERMINAL: UpdaterReportedStatus[] = ["succeeded", "failed", "rolled_back"];

/** Applies a progress report. Returns false when the transition is not allowed. */
export async function applyUpdaterReport(report: UpdaterReport): Promise<boolean> {
  const to = report.status as UpdateStatus;
  const from = [...statusesBefore(to), ...(to === "running" ? (["running"] as const) : [])];
  const terminal = TERMINAL.includes(report.status);
  const now = new Date();

  const [updated] = await db
    .update(updateRequests)
    .set({
      status: report.status,
      message: report.message?.slice(0, 500) ?? null,
      ...(report.logTail !== undefined ? { logTail: report.logTail.slice(-8000) } : {}),
      ...(terminal ? { finishedAt: now } : {}),
      updatedAt: now,
    })
    .where(and(eq(updateRequests.id, report.requestId), inArray(updateRequests.status, from)))
    .returning();
  if (!updated) return false;

  if (terminal) {
    await logAuditEvent({
      workspaceId: updated.organizationId,
      action: `update.${report.status}`,
      resourceType: "update_request",
      resourceId: updated.id,
      severity: report.status === "succeeded" ? "info" : "critical",
      metadata: {
        fromVersion: updated.fromVersion,
        targetVersion: updated.targetVersion,
        trigger: updated.trigger,
        message: updated.message,
      },
    });
  }
  return true;
}
