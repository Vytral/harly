import "server-only";

import { and, countDistinct, eq, exists, gte, isNull, sql } from "drizzle-orm";

import {
  applications,
  applicationStageHistory,
  candidates,
  db,
  jobs,
  jobStages,
  offers,
} from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";
import {
  averageTimeToHireDays,
  bucketTimeToHire,
  countEventsBetween,
  type HiringEvent,
} from "./metrics";
import { normalizeReportRange } from "./ranges";

/**
 * Hiring analytics for the Reports page. All queries are workspace-scoped and
 * read straight from the operational tables , no extra event log needed.
 */

const DAY_SECONDS = 86_400;

// Canonical funnel order. Stage names are consistent across jobs (default set),
// so aggregating reached-counts by name gives a workspace-wide funnel.
const FUNNEL_ORDER = ["Applied", "Screening", "Interview", "Offer", "Hired"];

export type ReportsSummary = {
  openRoles: number;
  totalCandidates: number;
  applications90d: number;
  hires: number;
  avgTimeToHireDays: number | null;
  offerAcceptRate: number | null;
};

export type MonthlyPoint = { month: string; label: string; count: number };
export type FunnelStage = { name: string; count: number; pct: number };
export type SourceRow = {
  source: string;
  candidates: number;
  hires: number;
  conversion: number;
};

export type TimeToHireBucket = { bucket: string; count: number };

export type PeriodComparison = {
  current: number;
  previous: number;
  deltaPct: number | null;
};

export type ReportsComparison = {
  rangeDays: number;
  applications: PeriodComparison;
  hires: PeriodComparison;
  avgTimeToHireDays: PeriodComparison;
};

export type ReportsData = {
  summary: ReportsSummary;
  applicationsByMonth: MonthlyPoint[];
  hiresByMonth: MonthlyPoint[];
  funnel: FunnelStage[];
  sources: SourceRow[];
  timeToHire: TimeToHireBucket[];
  comparison: ReportsComparison;
};

/**
 * Canonical hiring events. A hire is the first transition of an application
 * into a stage named Hired, rather than a later update to the application row.
 * Keeping this query here gives Reports, the dashboard and AI the same clock.
 */
export async function getHiringEvents(
  workspaceId: string,
  options: { since?: Date } = {},
): Promise<HiringEvent[]> {
  const hiredAt = sql<Date>`min(${applicationStageHistory.createdAt})`;

  const query = db
    .select({
      applicationId: applications.id,
      appliedAt: applications.appliedAt,
      hiredAt,
    })
    .from(applications)
    .innerJoin(
      applicationStageHistory,
      and(
        eq(applicationStageHistory.applicationId, applications.id),
        eq(applicationStageHistory.workspaceId, workspaceId),
      ),
    )
    .innerJoin(
      jobStages,
      and(
        eq(jobStages.id, applicationStageHistory.toStageId),
        eq(jobStages.workspaceId, workspaceId),
        sql`lower(trim(${jobStages.name})) = 'hired'`,
      ),
    )
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
        activeCandidateForApplication(workspaceId),
      ),
    )
    .groupBy(applications.id, applications.appliedAt);

  return options.since
    ? // Compare the aggregated min() against the cutoff as an ISO string.
      // Passing a raw Date into `having(gte(sqlAlias, Date))` reaches
      // postgres-js without the timestamp column's custom serializer and throws
      // ERR_INVALID_ARG_TYPE ("Received an instance of Date"). An ISO string
      // casts cleanly to timestamptz in the comparison.
      query.having(sql`min(${applicationStageHistory.createdAt}) >= ${options.since.toISOString()}`)
    : query;
}

/**
 * Counts applications that have reached Hired without materialising the
 * event history. This is intentionally the same relational definition used
 * by getHiringEvents, but keeps summary cards bounded for large workspaces.
 */
export async function countHiringEvents(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ count: countDistinct(applications.id) })
    .from(applications)
    .innerJoin(
      applicationStageHistory,
      and(
        eq(applicationStageHistory.applicationId, applications.id),
        eq(applicationStageHistory.workspaceId, workspaceId),
      ),
    )
    .innerJoin(
      jobStages,
      and(
        eq(jobStages.id, applicationStageHistory.toStageId),
        eq(jobStages.workspaceId, workspaceId),
        sql`lower(trim(${jobStages.name})) = 'hired'`,
      ),
    )
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
        activeCandidateForApplication(workspaceId),
      ),
    );

  return Number(row?.count ?? 0);
}

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function activeCandidateForApplication(workspaceId: string) {
  return exists(
    db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.id, applications.candidateId),
          eq(candidates.workspaceId, workspaceId),
          isNull(candidates.deletedAt),
        ),
      ),
  );
}

/** Period-over-period comparison range, in days. Defaults to 30 (current 30d vs prior 30d). */
export async function getReportsData(rangeDays = 30): Promise<ReportsData> {
  rangeDays = normalizeReportRange(rangeDays);
  const { organization } = await requirePermission("reports:read");
  const ws = organization.id;
  const now = new Date();
  const since90 = new Date(now.getTime() - 90 * DAY_SECONDS * 1000);
  const yearStart = new Date(now.getTime() - 365 * DAY_SECONDS * 1000);
  // The comparison can span two full periods (up to 730 days), while charts
  // only need the trailing year. Keep the event materialisation bounded to
  // the largest requested comparison window.
  const eventStart = new Date(
    now.getTime() - Math.max(365, rangeDays * 2) * DAY_SECONDS * 1000,
  );

  const curStart = new Date(now.getTime() - rangeDays * DAY_SECONDS * 1000).toISOString();
  const prevStart = new Date(now.getTime() - 2 * rangeDays * DAY_SECONDS * 1000).toISOString();

  const [
    openRolesRow,
    candidatesRow,
    apps90Row,
    hiringEvents,
    allTimeHires,
    offerRow,
    monthRows,
    funnelRows,
    sourceRows,
    comparisonRow,
  ] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, ws),
          eq(jobs.status, "open"),
          isNull(jobs.deletedAt),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(candidates)
      .where(and(eq(candidates.workspaceId, ws), sql`${candidates.deletedAt} is null`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(applications)
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, ws),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(applications.workspaceId, ws),
          activeCandidateForApplication(ws),
          gte(applications.appliedAt, since90),
        ),
      ),
    getHiringEvents(ws, { since: eventStart }),
    countHiringEvents(ws),
    db
      .select({
        accepted: sql<number>`count(*) filter (where ${offers.status} = 'accepted')::int`,
        decided: sql<number>`count(*) filter (where ${offers.status} in ('accepted','declined'))::int`,
      })
      .from(offers)
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, offers.jobId),
          eq(jobs.workspaceId, ws),
          isNull(jobs.deletedAt),
        ),
      )
      .where(eq(offers.workspaceId, ws)),
    db
      .select({
        month: sql<string>`to_char(${applications.appliedAt}, 'YYYY-MM')`,
        n: sql<number>`count(*)::int`,
      })
      .from(applications)
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, ws),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(applications.workspaceId, ws),
          activeCandidateForApplication(ws),
          gte(applications.appliedAt, new Date(now.getTime() - 365 * DAY_SECONDS * 1000)),
        ),
      )
      .groupBy(sql`to_char(${applications.appliedAt}, 'YYYY-MM')`),
    db
      .select({
        name: jobStages.name,
        n: sql<number>`count(distinct ${applicationStageHistory.applicationId})::int`,
      })
      .from(applicationStageHistory)
      .innerJoin(
        applications,
        and(
          eq(applications.id, applicationStageHistory.applicationId),
          eq(applications.workspaceId, ws),
        ),
      )
      .innerJoin(
        jobStages,
        and(
          eq(jobStages.id, applicationStageHistory.toStageId),
          eq(jobStages.workspaceId, ws),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, ws),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(applicationStageHistory.workspaceId, ws),
          activeCandidateForApplication(ws),
        ),
      )
      .groupBy(jobStages.name),
    db
      .select({
        source: sql<string>`coalesce(${applications.source}, 'unknown')`,
        candidates: sql<number>`count(*)::int`,
        hires: sql<number>`count(*) filter (where ${applications.status} = 'hired')::int`,
      })
      .from(applications)
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, ws),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(applications.workspaceId, ws),
          activeCandidateForApplication(ws),
        ),
      )
      .groupBy(sql`coalesce(${applications.source}, 'unknown')`),
    // Current vs previous period-over-period comparison (equal-length windows).
    db
      .select({
        curApps: sql<number>`count(*) filter (where ${applications.appliedAt} >= ${curStart}::timestamptz)::int`,
        prevApps: sql<number>`count(*) filter (where ${applications.appliedAt} >= ${prevStart}::timestamptz and ${applications.appliedAt} < ${curStart}::timestamptz)::int`,
      })
      .from(applications)
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, ws),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(applications.workspaceId, ws),
          activeCandidateForApplication(ws),
        ),
      ),
  ]);

  // Summary
  const decided = offerRow[0]?.decided ?? 0;
  const summary: ReportsSummary = {
    openRoles: openRolesRow[0]?.n ?? 0,
    totalCandidates: candidatesRow[0]?.n ?? 0,
    applications90d: apps90Row[0]?.n ?? 0,
    hires: allTimeHires,
    avgTimeToHireDays: averageTimeToHireDays(hiringEvents),
    offerAcceptRate:
      decided > 0 ? Math.round(((offerRow[0]?.accepted ?? 0) / decided) * 100) : null,
  };

  // Trailing 12 months, zero-filled.
  const counts = new Map(monthRows.map((r) => [r.month, r.n]));
  const applicationsByMonth: MonthlyPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(d);
    applicationsByMonth.push({
      month: key,
      label: MONTH_LABELS[d.getUTCMonth()],
      count: counts.get(key) ?? 0,
    });
  }

  // Funnel in canonical order; top of funnel is the denominator for pct.
  const funnelMap = new Map(funnelRows.map((r) => [r.name, r.n]));
  const top = funnelMap.get("Applied") ?? 0;
  const funnel: FunnelStage[] = FUNNEL_ORDER.map((name) => {
    const count = funnelMap.get(name) ?? 0;
    return { name, count, pct: top > 0 ? Math.round((count / top) * 100) : 0 };
  });

  // Source effectiveness, busiest first.
  const sources: SourceRow[] = sourceRows
    .map((r) => ({
      source: r.source,
      candidates: r.candidates,
      hires: r.hires,
      conversion: r.candidates > 0 ? Math.round((r.hires / r.candidates) * 100) : 0,
    }))
    .sort((a, b) => b.candidates - a.candidates);

  // Hires by month, trailing 12, zero-filled. The month is the first Hired
  // transition, not whichever later edit happened to touch the application.
  const hireCounts = new Map<string, number>();
  for (const event of hiringEvents) {
    const hiredAt = new Date(event.hiredAt);
    if (hiredAt >= yearStart) {
      const key = monthKey(hiredAt);
      hireCounts.set(key, (hireCounts.get(key) ?? 0) + 1);
    }
  }
  const hiresByMonth: MonthlyPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(d);
    hiresByMonth.push({
      month: key,
      label: MONTH_LABELS[d.getUTCMonth()],
      count: hireCounts.get(key) ?? 0,
    });
  }

  const timeToHire: TimeToHireBucket[] = bucketTimeToHire(hiringEvents);

  // Period-over-period comparison for the current stat cards.
  const cmp = comparisonRow[0];
  const currentStart = new Date(curStart);
  const previousStart = new Date(prevStart);
  const currentHires = hiringEvents.filter(
    (event) => new Date(event.hiredAt) >= currentStart,
  );
  const previousHires = hiringEvents.filter((event) => {
    const hiredAt = new Date(event.hiredAt);
    return hiredAt >= previousStart && hiredAt < currentStart;
  });
  const curAvgTth = averageTimeToHireDays(currentHires);
  const prevAvgTth = averageTimeToHireDays(previousHires);
  const comparison: ReportsComparison = {
    rangeDays,
    applications: {
      current: cmp?.curApps ?? 0,
      previous: cmp?.prevApps ?? 0,
      deltaPct: deltaPct(cmp?.curApps ?? 0, cmp?.prevApps ?? 0),
    },
    hires: {
      current: countEventsBetween(hiringEvents, currentStart),
      previous: countEventsBetween(hiringEvents, previousStart, currentStart),
      deltaPct: deltaPct(
        countEventsBetween(hiringEvents, currentStart),
        countEventsBetween(hiringEvents, previousStart, currentStart),
      ),
    },
    avgTimeToHireDays: {
      current: curAvgTth ?? 0,
      previous: prevAvgTth ?? 0,
      // Standard current-vs-previous delta; a negative value means hiring got
      // *faster* here (fewer days), so the UI inverts polarity for this stat only.
      deltaPct:
        prevAvgTth != null && curAvgTth != null
          ? deltaPct(curAvgTth, prevAvgTth)
          : null,
    },
  };

  return {
    summary,
    applicationsByMonth,
    hiresByMonth,
    funnel,
    sources,
    timeToHire,
    comparison,
  };
}
