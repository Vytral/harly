import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";

import {
  applications,
  db,
  jobs,
  scheduledReportRuns,
  scheduledReports,
} from "@harly/db";
import { enqueueEmailOutbox } from "@/lib/email/outbox-processor";
import { getHiringEvents } from "@/features/reports/data";
import { getAdvancedHiringAnalytics } from "@/features/reports/advanced";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function nextRun(frequency: string, from = new Date()): Date {
  const result = new Date(from);
  if (frequency === "daily") result.setUTCDate(result.getUTCDate() + 1);
  else if (frequency === "weekly") result.setUTCDate(result.getUTCDate() + 7);
  else result.setUTCMonth(result.getUTCMonth() + 1);
  return result;
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

export async function listScheduledReports(workspaceId: string) {
  return db.select().from(scheduledReports).where(eq(scheduledReports.workspaceId, workspaceId)).orderBy(asc(scheduledReports.nextRunAt));
}

export async function runDueScheduledReports(limit = 25) {
  const now = new Date();
  const due = await db.select().from(scheduledReports).where(and(eq(scheduledReports.enabled, true), lte(scheduledReports.nextRunAt, now), or(isNull(scheduledReports.lockedAt), lte(scheduledReports.lockedAt, new Date(now.getTime() - 10 * 60_000))))).orderBy(asc(scheduledReports.nextRunAt)).limit(limit);
  let processed = 0;
  let failed = 0;
  for (const report of due) {
    const workerId = randomUUID();
    const [claimed] = await db.update(scheduledReports).set({ lockedAt: now, lockedBy: workerId, updatedAt: now }).where(and(eq(scheduledReports.id, report.id), or(isNull(scheduledReports.lockedAt), lte(scheduledReports.lockedAt, new Date(now.getTime() - 10 * 60_000))))).returning();
    if (!claimed) continue;
    const periodEnd = now;
    const periodStart = new Date(now.getTime() - 30 * 86_400_000);
    const [run] = await db.insert(scheduledReportRuns).values({
      workspaceId: report.workspaceId,
      scheduledReportId: report.id,
      periodStart,
      periodEnd,
      status: "running",
      recipientCount: Array.isArray(report.recipients) ? report.recipients.length : 0,
    }).returning();
    try {
      const overview = await getReportsDataForWorkspace(report.workspaceId, 30);
      const advanced = report.reportType === "advanced_hiring" ? await getAdvancedHiringAnalytics(report.workspaceId, { since: periodStart }) : null;
      const bodyHtml = renderReportHtml(report.name, overview, advanced);
      for (const to of (Array.isArray(report.recipients) ? report.recipients : [])) {
        await enqueueEmailOutbox(report.workspaceId, "report.scheduled", {
          to,
          subject: `${report.name} · Harly hiring report`,
          bodyHtml,
          companyName: "Harly",
        }, `scheduled-report:${report.id}:${periodEnd.toISOString()}:${to}`);
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
  return { processed, failed };
}

async function getReportsDataForWorkspace(workspaceId: string, rangeDays: number) {
  // The existing page loader is session-gated. Scheduled workers use this
  // narrow, workspace-scoped aggregate instead of impersonating a user.
  const periodStart = new Date(Date.now() - rangeDays * 86_400_000);
  const [applicationRows, hireRows] = await Promise.all([
    db
      .select({ appliedAt: applications.appliedAt })
      .from(applications)
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, workspaceId),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          gte(applications.appliedAt, periodStart),
        ),
    ),
    getHiringEvents(workspaceId, { since: periodStart }),
  ]);

  return {
    applications: applicationRows.length,
    hires: hireRows.length,
  };
}

function renderReportHtml(name: string, overview: { applications: number; hires: number }, advanced: Awaited<ReturnType<typeof getAdvancedHiringAnalytics>> | null) {
  const rows = advanced?.stageSla.map((row) => `<tr><td>${escapeHtml(row.stage)}</td><td>${row.transitions}</td><td>${row.averageDays ?? "—"}d</td><td>${row.breached}</td></tr>`).join("") ?? "";
  return `<h1>${escapeHtml(name)}</h1><p>Applications: <strong>${overview.applications}</strong></p><p>Hires: <strong>${overview.hires}</strong></p>${advanced ? `<h2>Stage SLA</h2><table><tr><th>Stage</th><th>Transitions</th><th>Average</th><th>Breached</th></tr>${rows}</table>` : ""}`;
}
