import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";

import {
  db,
  member,
  scheduledReportRuns,
  scheduledReports,
} from "@harly/db";
import { enqueueEmailOutbox } from "@/lib/email/outbox-processor";
import { scheduledReportEmailDedupeKey } from "@/lib/email/dedupe-keys";
import { getServerLogger } from "@/lib/logger";

import { nextRun } from "./cadence";
import { getAdvancedHiringAnalytics, type AdvancedHiringAnalytics } from "@/features/reports/advanced";
import { getWorkspaceTimeZone } from "@/features/reports/canonical";
import { loadReportsData, type ReportsData } from "@/features/reports/data";
import { type ReportsActor } from "@/features/reports/scope";
import { resolveWindow, type ReportWindow } from "@/features/reports/window";
import { isUnrestrictedScope } from "@/features/search/scope";
import { getRolePolicy } from "@/features/workspaces/permissions-server";

const log = getServerLogger();

/** Scheduled reports always cover the last 30 days, the Reports page default. */
export const SCHEDULED_REPORT_DAYS = 30;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function createScheduledReport(input: {
  workspaceId: string;
  name: string;
  recipients: string[];
  frequency: "daily" | "weekly" | "monthly";
  reportType?: "hiring_overview" | "advanced_hiring";
  createdById?: string | null;
}) {
  const recipients = [...new Set(input.recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length === 0) throw new Error("At least one report recipient is required.");
  const [row] = await db.insert(scheduledReports).values({
    workspaceId: input.workspaceId,
    name: input.name.trim().slice(0, 120),
    recipients,
    frequency: input.frequency,
    reportType: input.reportType ?? "hiring_overview",
    createdById: input.createdById ?? null,
    nextRunAt: nextRun(input.frequency),
  }).returning();
  return row;
}

/**
 * Schedules in a workspace, each with the most recent run's status and reason.
 * A skipped run carries the reason a schedule did not send, so owners can see it.
 */
export async function listScheduledReports(workspaceId: string) {
  const rows = await db.select().from(scheduledReports).where(eq(scheduledReports.workspaceId, workspaceId)).orderBy(asc(scheduledReports.nextRunAt));
  if (rows.length === 0) return [];
  const latest = await db
    .selectDistinctOn([scheduledReportRuns.scheduledReportId], {
      scheduledReportId: scheduledReportRuns.scheduledReportId,
      status: scheduledReportRuns.status,
      error: scheduledReportRuns.error,
      createdAt: scheduledReportRuns.createdAt,
    })
    .from(scheduledReportRuns)
    .where(eq(scheduledReportRuns.workspaceId, workspaceId))
    .orderBy(scheduledReportRuns.scheduledReportId, desc(scheduledReportRuns.createdAt));
  const lastRunBySchedule = new Map(
    latest.map((run) => [run.scheduledReportId, { status: run.status, error: run.error, createdAt: run.createdAt }]),
  );
  return rows.map((row) => ({ ...row, lastRun: lastRunBySchedule.get(row.id) ?? null }));
}

export type ScheduleActorResolution =
  | { ok: true; actor: ReportsActor }
  | { ok: false; reason: string };

/**
 * The actor a schedule runs under: its creator, resolved now. A schedule only
 * sends for a creator who is still a member, still holds reports:read, and has
 * an unrestricted role scope. Anything else is skipped with the reason returned.
 */
export async function resolveScheduleActor(
  workspaceId: string,
  createdById: string | null,
): Promise<ScheduleActorResolution> {
  if (!createdById) {
    return { ok: false, reason: "The schedule has no creator on record. Recreate it as a workspace owner or admin." };
  }
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, createdById)))
    .limit(1);
  if (!membership) {
    return { ok: false, reason: "The schedule's creator is no longer a member of this workspace." };
  }
  const policy = await getRolePolicy(workspaceId, membership.role);
  if (!policy.permissions.includes("reports:read")) {
    return { ok: false, reason: "The schedule's creator no longer has report access." };
  }
  if (!isUnrestrictedScope(policy.scope)) {
    return {
      ok: false,
      reason: "The schedule's creator is limited to specific jobs. Reports are only sent for unrestricted roles.",
    };
  }
  return { ok: true, actor: { scope: policy.scope } };
}

async function recordSkippedRun(
  report: typeof scheduledReports.$inferSelect,
  workerId: string,
  now: Date,
  reason: string,
) {
  log.warn({ scheduledReportId: report.id, workspaceId: report.workspaceId, reason }, "scheduled report skipped");
  await db.insert(scheduledReportRuns).values({
    workspaceId: report.workspaceId,
    scheduledReportId: report.id,
    periodStart: now,
    periodEnd: now,
    status: "skipped",
    recipientCount: Array.isArray(report.recipients) ? report.recipients.length : 0,
    error: reason.slice(0, 500),
  });
  await db.update(scheduledReports).set({ nextRunAt: nextRun(report.frequency, now), lockedAt: null, lockedBy: null, updatedAt: now }).where(and(eq(scheduledReports.id, report.id), eq(scheduledReports.lockedBy, workerId)));
}

/**
 * Sends every due schedule. Each one runs under its creator's current access;
 * a schedule that the creator may no longer read is skipped and recorded, never
 * built. `options.workspaceId` limits the sweep to one workspace.
 */
export async function runDueScheduledReports(limit = 25, options: { workspaceId?: string } = {}) {
  const now = new Date();
  const due = await db.select().from(scheduledReports).where(and(eq(scheduledReports.enabled, true), options.workspaceId ? eq(scheduledReports.workspaceId, options.workspaceId) : undefined, lte(scheduledReports.nextRunAt, now), or(isNull(scheduledReports.lockedAt), lte(scheduledReports.lockedAt, new Date(now.getTime() - 10 * 60_000))))).orderBy(asc(scheduledReports.nextRunAt)).limit(limit);
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  for (const report of due) {
    const workerId = randomUUID();
    const [claimed] = await db.update(scheduledReports).set({ lockedAt: now, lockedBy: workerId, updatedAt: now }).where(and(eq(scheduledReports.id, report.id), or(isNull(scheduledReports.lockedAt), lte(scheduledReports.lockedAt, new Date(now.getTime() - 10 * 60_000))))).returning();
    if (!claimed) continue;
    const resolution = await resolveScheduleActor(report.workspaceId, report.createdById);
    if (!resolution.ok) {
      skipped += 1;
      await recordSkippedRun(report, workerId, now, resolution.reason);
      continue;
    }
    const [run] = await db.insert(scheduledReportRuns).values({
      workspaceId: report.workspaceId,
      scheduledReportId: report.id,
      periodStart: now,
      periodEnd: now,
      status: "running",
      recipientCount: Array.isArray(report.recipients) ? report.recipients.length : 0,
    }).returning();
    try {
      const built = await buildScheduledReport({
        workspaceId: report.workspaceId,
        name: report.name,
        reportType: report.reportType === "advanced_hiring" ? "advanced_hiring" : "hiring_overview",
        now,
        actor: resolution.actor,
      });
      await db.update(scheduledReportRuns).set({
        periodStart: built.window.from,
        periodEnd: built.window.to,
      }).where(eq(scheduledReportRuns.id, run.id));
      // Key on the due slot, not the tick time, so a retried tick for the same
      // slot does not send the period's report again.
      const periodStart = report.nextRunAt ?? now;
      for (const to of (Array.isArray(report.recipients) ? report.recipients : [])) {
        await enqueueEmailOutbox(report.workspaceId, "report.scheduled", {
          to,
          subject: `${report.name} · Harly hiring report`,
          bodyHtml: built.html,
          companyName: "Harly",
        }, scheduledReportEmailDedupeKey({ scheduledReportId: report.id, periodStart, recipient: to }));
      }
      await db.update(scheduledReportRuns).set({ status: "queued", sentAt: new Date() }).where(eq(scheduledReportRuns.id, run.id));
      await db.update(scheduledReports).set({ lastRunAt: now, nextRunAt: nextRun(report.frequency, now), lockedAt: null, lockedBy: null, updatedAt: now }).where(and(eq(scheduledReports.id, report.id), eq(scheduledReports.lockedBy, workerId)));
      processed += 1;
    } catch (error) {
      failed += 1;
      await db.update(scheduledReportRuns).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "report failed" }).where(eq(scheduledReportRuns.id, run.id));
      await db.update(scheduledReports).set({ nextRunAt: nextRun("daily", now), lockedAt: null, lockedBy: null, updatedAt: now }).where(and(eq(scheduledReports.id, report.id), eq(scheduledReports.lockedBy, workerId)));
    }
  }
  return { processed, failed, skipped };
}

/**
 * Builds the scheduled email for a workspace. It uses the same assembly as the
 * Reports page, so the totals in the email match the page for the same range.
 */
export async function buildScheduledReport({
  workspaceId,
  name,
  reportType,
  now = new Date(),
  actor,
}: {
  workspaceId: string;
  name: string;
  reportType: "hiring_overview" | "advanced_hiring";
  now?: Date;
  actor: ReportsActor;
}): Promise<{
  data: ReportsData;
  advanced: AdvancedHiringAnalytics | null;
  window: ReportWindow;
  html: string;
}> {
  const timeZone = await getWorkspaceTimeZone(workspaceId);
  const window = resolveWindow(SCHEDULED_REPORT_DAYS, timeZone, now);
  const data = await loadReportsData({ workspaceId, days: SCHEDULED_REPORT_DAYS, now, actor });
  const advanced =
    reportType === "advanced_hiring"
      ? await getAdvancedHiringAnalytics({ workspaceId, window, actor })
      : null;
  return { data, advanced, window, html: renderReportHtml(name, data, advanced) };
}

function formatDays(value: number | null): string {
  return value == null ? "No data" : `${Math.round(value)}d`;
}

function formatPct(value: number | null): string {
  return value == null ? "—" : `${value}%`;
}

function renderReportHtml(name: string, data: ReportsData, advanced: AdvancedHiringAnalytics | null) {
  const { summary, range } = data;
  const scope = `${range.label} · as of ${data.generatedAt.slice(0, 16).replace("T", " ")} UTC`;
  const funnelRows = data.funnel
    .map((stage) => `<tr><td>${escapeHtml(stage.name)}</td><td>${stage.count}</td><td>${formatPct(stage.pct)}</td></tr>`)
    .join("");
  const slaRows = advanced?.stageSla
    .map((row) => `<tr><td>${escapeHtml(row.stage)}</td><td>${row.transitions}</td><td>${row.averageDays == null ? "—" : `${row.averageDays}d`}</td><td>${row.breached}</td></tr>`)
    .join("") ?? "";
  return `<h1>${escapeHtml(name)}</h1>`
    + `<p>${escapeHtml(scope)}</p>`
    + `<p>Applications received: <strong>${summary.applications}</strong></p>`
    + `<p>Hires: <strong>${summary.hires}</strong></p>`
    + `<p>Average time to hire: <strong>${formatDays(summary.avgTimeToHireDays)}</strong></p>`
    + `<p>Offer acceptance: <strong>${formatPct(summary.offerAcceptRate)}</strong></p>`
    + `<h2>Funnel (applications received in range)</h2><table><tr><th>Stage</th><th>Reached</th><th>Share</th></tr>${funnelRows}</table>`
    + (advanced ? `<h2>Stage SLA</h2><table><tr><th>Stage</th><th>Transitions</th><th>Average</th><th>Breached</th></tr>${slaRows}</table>` : "");
}
