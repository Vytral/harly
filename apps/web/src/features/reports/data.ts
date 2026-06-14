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

export type ReportsData = {
  summary: ReportsSummary;
  applicationsByMonth: MonthlyPoint[];
  funnel: FunnelStage[];
  sources: SourceRow[];
};

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export async function getReportsData(): Promise<ReportsData> {
  const { organization } = await getWorkspaceContext();
  const ws = organization.id;
  const now = new Date();
  const since90 = new Date(now.getTime() - 90 * DAY_SECONDS * 1000);

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

  return { summary, applicationsByMonth, funnel, sources };
}
