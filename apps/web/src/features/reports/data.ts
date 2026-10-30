import "server-only";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { getRolePolicy, requirePermission } from "@/features/workspaces/permissions-server";
import {
  getHireStats,
  getHiringKpis,
  getMonthlyCounts,
  getPopulationCounts,
  getSourceEffectiveness,
  getWorkspaceFunnel,
  getWorkspaceTimeZone,
  type FunnelKind,
} from "./canonical";
import { normalizeReportRange, reportRangeLabel, type ReportRangeDays } from "./ranges";
import { assertUnrestrictedReportsActor, type ReportsActor } from "./scope";
import {
  monthLabel,
  percentChange,
  previousWindow,
  resolveWindow,
  trailingMonths,
  type ReportWindow,
} from "./window";

/**
 * Reports page data. Every number comes from the canonical metric functions
 * in `./canonical`, so the page, the dashboard, the scheduled email and the AI
 * tools agree. Each card states its scope: the selected range, the last 12
 * months, or all time.
 */

export type ReportsSummary = {
  /** Current state: open jobs that are not deleted. */
  openRoles: number;
  /** All time: candidates that are not deleted. */
  totalCandidates: number;
  /** In range: applications received. */
  applications: number;
  /** In range: canonical hires dated in range. */
  hires: number;
  /** In range: average days from apply to hire, or null with no hires. */
  avgTimeToHireDays: number | null;
  /** In range: accepted / decided offers, or null when none were decided. */
  offerAcceptRate: number | null;
  offers: { accepted: number; declined: number };
};

export type MonthlyPoint = { month: string; label: string; count: number };

export type FunnelStage = {
  kind: FunnelKind;
  name: string;
  /** Applications received in range that reached this stage kind. */
  count: number;
  /** Share of applications received, or null when there are none. */
  pct: number | null;
  /** Applications sitting in this stage kind right now. */
  activeNow: number;
};

export type SourceRow = {
  source: string;
  /** Applications received in range from this source. */
  applications: number;
  /** Canonical hires dated in range from this source. */
  hires: number;
  /** Hires per application (whole percent), or null with no applications. */
  conversion: number | null;
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
  generatedAt: string;
  timeZone: string;
  range: {
    days: ReportRangeDays;
    label: string;
    from: string;
    to: string;
  };
  summary: ReportsSummary;
  /** Trailing 12 calendar months, in the workspace time zone. */
  applicationsByMonth: MonthlyPoint[];
  /** Trailing 12 calendar months, in the workspace time zone. */
  hiresByMonth: MonthlyPoint[];
  /** Workspace-wide funnel for applications received in range. */
  funnel: FunnelStage[];
  sources: SourceRow[];
  timeToHire: TimeToHireBucket[];
  timeToHireStats: {
    measured: number;
    averageDays: number | null;
    medianDays: number | null;
  };
  comparison: ReportsComparison;
};

/**
 * Builds the report for a workspace at an instant. This is the one assembly
 * path: the Reports page, the scheduled email and tests all call it. The actor
 * is whoever the report is built for; a role limited to specific jobs is refused
 * here, so no caller can get workspace-wide metrics through this function.
 */
export async function loadReportsData({
  workspaceId,
  days,
  now = new Date(),
  actor,
}: {
  workspaceId: string;
  days: number;
  now?: Date;
  actor: ReportsActor;
}): Promise<ReportsData> {
  assertUnrestrictedReportsActor(actor);
  const rangeDays = normalizeReportRange(days);
  const timeZone = await getWorkspaceTimeZone(workspaceId);
  const window = resolveWindow(rangeDays, timeZone, now);
  const prior = previousWindow(window, now);
  const trailing = trailingMonths(12, timeZone, now);
  const trailingWindow: ReportWindow = trailing.window;

  const [population, kpis, priorKpis, hireStats, funnel, sources, applicationMonths, hireMonths] =
    await Promise.all([
      getPopulationCounts(workspaceId),
      getHiringKpis({ workspaceId, window }),
      getHiringKpis({ workspaceId, window: prior }),
      getHireStats({ workspaceId, window }),
      getWorkspaceFunnel({ workspaceId, window }),
      getSourceEffectiveness({ workspaceId, window }),
      getMonthlyCounts({ workspaceId, window: trailingWindow }, "applications"),
      getMonthlyCounts({ workspaceId, window: trailingWindow }, "hires"),
    ]);

  const toMonthly = (counts: Map<string, number>): MonthlyPoint[] =>
    trailing.keys.map((key) => ({
      month: key,
      label: monthLabel(key),
      count: counts.get(key) ?? 0,
    }));

  return {
    generatedAt: now.toISOString(),
    timeZone,
    range: {
      days: rangeDays,
      label: reportRangeLabel(rangeDays),
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    },
    summary: {
      openRoles: population.openRoles,
      totalCandidates: population.candidatesAllTime,
      applications: kpis.applications,
      hires: kpis.hires,
      avgTimeToHireDays: kpis.averageTimeToHireDays,
      offerAcceptRate: kpis.offers.rate,
      offers: { accepted: kpis.offers.accepted, declined: kpis.offers.declined },
    },
    applicationsByMonth: toMonthly(applicationMonths),
    hiresByMonth: toMonthly(hireMonths),
    funnel: funnel.stages.map((stage) => ({
      kind: stage.kind,
      name: stage.label,
      count: stage.reached,
      pct: stage.pct,
      activeNow: stage.activeNow,
    })),
    sources: sources.map((row) => ({
      source: row.source,
      applications: row.applications,
      hires: row.hires,
      conversion: row.conversion,
    })),
    timeToHire: hireStats.buckets,
    timeToHireStats: {
      measured: hireStats.measured,
      averageDays: hireStats.averageDays,
      medianDays: hireStats.medianDays,
    },
    comparison: {
      rangeDays,
      applications: comparisonOf(kpis.applications, priorKpis.applications),
      hires: comparisonOf(kpis.hires, priorKpis.hires),
      avgTimeToHireDays: {
        current: kpis.averageTimeToHireDays ?? 0,
        previous: priorKpis.averageTimeToHireDays ?? 0,
        // Standard current-vs-previous delta. A negative value means hiring got
        // faster, so the UI inverts the polarity for this card only.
        deltaPct:
          kpis.averageTimeToHireDays != null && priorKpis.averageTimeToHireDays != null
            ? percentChange(kpis.averageTimeToHireDays, priorKpis.averageTimeToHireDays)
            : null,
      },
    },
  };
}

function comparisonOf(current: number, previous: number): PeriodComparison {
  return { current, previous, deltaPct: percentChange(current, previous) };
}

/**
 * Reports data for the signed-in user's workspace. Requires reports:read and an
 * unrestricted role scope; a role limited to specific jobs gets a ReportsScopeError.
 */
export async function getReportsData(rangeDays = 30): Promise<ReportsData> {
  const { organization } = await requirePermission("reports:read");
  const context = await getWorkspaceContext();
  const policy = await getRolePolicy(organization.id, context.roleKey);
  return loadReportsData({
    workspaceId: organization.id,
    days: normalizeReportRange(rangeDays),
    now: new Date(),
    actor: { scope: policy.scope },
  });
}
