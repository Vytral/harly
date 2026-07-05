import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import {
  applications,
  applicationStageHistory,
  candidates,
  db,
  jobs,
  jobStages,
  offers,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";

/**
 * Hiring analytics for the Reports page. All queries are workspace-scoped and
 * read straight from the operational tables — no extra event log needed.
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

/** Period-over-period comparison range, in days. Defaults to 30 (current 30d vs prior 30d). */
export async function getReportsData(rangeDays = 30): Promise<ReportsData> {
  const { organization } = await getWorkspaceContext();
  const ws = organization.id;
  const now = new Date();
  const since90 = new Date(now.getTime() - 90 * DAY_SECONDS * 1000);

  const curStart = new Date(now.getTime() - rangeDays * DAY_SECONDS * 1000).toISOString();
  const prevStart = new Date(now.getTime() - 2 * rangeDays * DAY_SECONDS * 1000).toISOString();

  const [
    openRolesRow,
    candidatesRow,
    apps90Row,
    hiresRow,
    timeToHireRow,
    offerRow,
    monthRows,
    funnelRows,
    sourceRows,
    hireMonthRows,
    timeToHireDaysRows,
    comparisonRow,
  ] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, ws), eq(jobs.status, "open"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(candidates)
      .where(and(eq(candidates.workspaceId, ws), sql`${candidates.deletedAt} is null`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(applications)
      .where(and(eq(applications.workspaceId, ws), gte(applications.appliedAt, since90))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(applications)
      .where(and(eq(applications.workspaceId, ws), eq(applications.status, "hired"))),
    db
      .select({
        avgSeconds: sql<number | null>`avg(extract(epoch from (${applications.updatedAt} - ${applications.appliedAt})))`,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, ws),
          eq(applications.status, "hired"),
          sql`${applications.appliedAt} is not null`,
        ),
      ),
    db
      .select({
        accepted: sql<number>`count(*) filter (where ${offers.status} = 'accepted')::int`,
        decided: sql<number>`count(*) filter (where ${offers.status} in ('accepted','declined'))::int`,
      })
      .from(offers)
      .where(eq(offers.workspaceId, ws)),
    db
      .select({
        month: sql<string>`to_char(${applications.appliedAt}, 'YYYY-MM')`,
        n: sql<number>`count(*)::int`,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, ws),
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
      .innerJoin(jobStages, eq(jobStages.id, applicationStageHistory.toStageId))
      .where(eq(applicationStageHistory.workspaceId, ws))
      .groupBy(jobStages.name),
    db
      .select({
        source: sql<string>`coalesce(${applications.source}, 'unknown')`,
        candidates: sql<number>`count(*)::int`,
        hires: sql<number>`count(*) filter (where ${applications.status} = 'hired')::int`,
      })
      .from(applications)
      .where(eq(applications.workspaceId, ws))
      .groupBy(sql`coalesce(${applications.source}, 'unknown')`),
    // Hires by month (trailing 12 months)
    db
      .select({
        month: sql<string>`to_char(${applications.updatedAt}, 'YYYY-MM')`,
        n: sql<number>`count(*)::int`,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, ws),
          eq(applications.status, "hired"),
          gte(applications.updatedAt, new Date(now.getTime() - 365 * DAY_SECONDS * 1000)),
        ),
      )
      .groupBy(sql`to_char(${applications.updatedAt}, 'YYYY-MM')`),
    // Time-to-hire distribution in day-range buckets
    db
      .select({
        days: sql<number>`extract(epoch from (${applications.updatedAt} - ${applications.appliedAt}))::int / ${DAY_SECONDS}`,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, ws),
          eq(applications.status, "hired"),
          sql`${applications.appliedAt} is not null`,
        ),
      ),
    // Current vs previous period-over-period comparison (equal-length windows).
    db
      .select({
        curApps: sql<number>`count(*) filter (where ${applications.appliedAt} >= ${curStart}::timestamptz)::int`,
        prevApps: sql<number>`count(*) filter (where ${applications.appliedAt} >= ${prevStart}::timestamptz and ${applications.appliedAt} < ${curStart}::timestamptz)::int`,
        curHires: sql<number>`count(*) filter (where ${applications.status} = 'hired' and ${applications.updatedAt} >= ${curStart}::timestamptz)::int`,
        prevHires: sql<number>`count(*) filter (where ${applications.status} = 'hired' and ${applications.updatedAt} >= ${prevStart}::timestamptz and ${applications.updatedAt} < ${curStart}::timestamptz)::int`,
        curAvgTthSeconds: sql<number | null>`avg(extract(epoch from (${applications.updatedAt} - ${applications.appliedAt}))) filter (where ${applications.status} = 'hired' and ${applications.appliedAt} is not null and ${applications.updatedAt} >= ${curStart}::timestamptz)`,
        prevAvgTthSeconds: sql<number | null>`avg(extract(epoch from (${applications.updatedAt} - ${applications.appliedAt}))) filter (where ${applications.status} = 'hired' and ${applications.appliedAt} is not null and ${applications.updatedAt} >= ${prevStart}::timestamptz and ${applications.updatedAt} < ${curStart}::timestamptz)`,
      })
      .from(applications)
      .where(eq(applications.workspaceId, ws)),
  ]);

  // Summary
  const avgSeconds = timeToHireRow[0]?.avgSeconds ?? null;
  const decided = offerRow[0]?.decided ?? 0;
  const summary: ReportsSummary = {
    openRoles: openRolesRow[0]?.n ?? 0,
    totalCandidates: candidatesRow[0]?.n ?? 0,
    applications90d: apps90Row[0]?.n ?? 0,
    hires: hiresRow[0]?.n ?? 0,
    avgTimeToHireDays:
      avgSeconds != null ? Math.round(Number(avgSeconds) / DAY_SECONDS) : null,
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

  // Hires by month, trailing 12, zero-filled.
  const hireCounts = new Map(hireMonthRows.map((r) => [r.month, r.n]));
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

  // Time-to-hire histogram buckets.
  const TTH_BUCKETS: [string, number, number][] = [
    ["0–14d", 0, 14],
    ["15–30d", 15, 30],
    ["31–60d", 31, 60],
    ["61–90d", 61, 90],
    ["90d+", 91, Infinity],
  ];
  const timeToHire: TimeToHireBucket[] = TTH_BUCKETS.map(([bucket]) => ({
    bucket,
    count: 0,
  }));
  for (const row of timeToHireDaysRows) {
    const d = row.days;
    const idx = TTH_BUCKETS.findIndex(([, lo, hi]) => d >= lo && d <= hi);
    if (idx >= 0) timeToHire[idx].count++;
  }

  // Period-over-period comparison for the current stat cards.
  const cmp = comparisonRow[0];
  const curAvgTth = cmp?.curAvgTthSeconds != null ? Number(cmp.curAvgTthSeconds) / DAY_SECONDS : 0;
  const prevAvgTth = cmp?.prevAvgTthSeconds != null ? Number(cmp.prevAvgTthSeconds) / DAY_SECONDS : 0;
  const comparison: ReportsComparison = {
    rangeDays,
    applications: {
      current: cmp?.curApps ?? 0,
      previous: cmp?.prevApps ?? 0,
      deltaPct: deltaPct(cmp?.curApps ?? 0, cmp?.prevApps ?? 0),
    },
    hires: {
      current: cmp?.curHires ?? 0,
      previous: cmp?.prevHires ?? 0,
      deltaPct: deltaPct(cmp?.curHires ?? 0, cmp?.prevHires ?? 0),
    },
    avgTimeToHireDays: {
      current: Math.round(curAvgTth),
      previous: Math.round(prevAvgTth),
      // Standard current-vs-previous delta; a negative value means hiring got
      // *faster* here (fewer days), so the UI inverts polarity for this stat only.
      deltaPct: cmp?.prevAvgTthSeconds != null ? deltaPct(curAvgTth, prevAvgTth) : null,
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
