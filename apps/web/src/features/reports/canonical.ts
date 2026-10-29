import "server-only";

import { cache } from "react";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  candidates,
  db,
  effectiveStageKindSql,
  jobStages,
  jobs,
  stageIsKindSql,
  workspaceSettings,
  type StageKind,
} from "@harly/db";

import { TIME_TO_HIRE_BUCKETS } from "./metrics";
import { dayKeysInWindow, normalizeTimeZone, type ReportWindow } from "./window";

/**
 * Canonical hiring metrics.
 *
 * Every surface (Reports page, dashboard, scheduled email, AI tools, API)
 * reads its numbers from this module, so a given metric has exactly one
 * definition:
 *
 * - Active population: applications whose job and candidate are not
 *   soft-deleted. Closed and draft jobs stay in historical metrics.
 * - Applications received: active population with `applied_at` in the window.
 * - Hire: an application whose current status is `hired`. Its hire date is the
 *   latest transition into a stage whose EFFECTIVE KIND is `hired` (never a
 *   stage name). Legacy hires with no such transition fall back to the
 *   earliest `application.hired` activity event, then to `updated_at`. Each
 *   application counts once, in the window that contains its hire date.
 * - Time to hire: hire date minus `applied_at`, in days, for hires in window.
 * - Offer acceptance: accepted / (accepted + declined) over offers whose
 *   `decided_at` falls in the window. `null` when nothing was decided.
 * - Funnel: applications received in the window that ever reached each stage
 *   kind (history or current stage). Conversion is against applications
 *   received, not against the stage called "Applied".
 *
 * Aggregation runs in SQL. Nothing loads a row per hire, and the React cache
 * makes repeated calls in one request compute once.
 */

export type HireStats = {
  hires: number;
  /** Hires with a non-negative time to hire, the population for the averages. */
  measured: number;
  averageDays: number | null;
  medianDays: number | null;
  buckets: { bucket: string; count: number }[];
};

export type OfferAcceptance = {
  accepted: number;
  declined: number;
  /** Whole percent, or null when no offers were decided in the window. */
  rate: number | null;
};

export type HiringKpis = {
  applications: number;
  hires: number;
  averageTimeToHireDays: number | null;
  offers: OfferAcceptance;
};

export const FUNNEL_KINDS = ["applied", "screening", "interview", "offer", "hired"] as const;
export type FunnelKind = (typeof FUNNEL_KINDS)[number];

export type WorkspaceFunnelStage = {
  kind: FunnelKind;
  label: string;
  /** Applications received in the window that reached this kind. */
  reached: number;
  /** Share of applications received, or null when none were received. */
  pct: number | null;
  /** Applications currently active in this kind. */
  activeNow: number;
};

export type JobFunnelStage = {
  stageId: string;
  name: string;
  kind: StageKind;
  order: number;
  reached: number;
  pct: number | null;
  activeNow: number;
};

export type SourceEffectiveness = {
  source: string;
  applications: number;
  hires: number;
  /** Hires per application, whole percent, or null with no applications. */
  conversion: number | null;
};

export type ScopedWindow = { workspaceId: string; window: ReportWindow };

// ── Shared SQL ──────────────────────────────────────────────────────────────

const at = (value: Date) => sql`${value.toISOString()}::timestamptz`;

/**
 * CTE body: the active population of applications. Callers prepend `with`
 * and may append further CTEs after a comma.
 */
export function activeAppsSql(workspaceId: string): SQL {
  return sql`
    active_apps as (
      select a.id, a.candidate_id, a.job_id, a.source, a.status, a.applied_at, a.updated_at, a.current_stage_id
      from applications a
      inner join jobs j
        on j.id = a.job_id and j.workspace_id = a.workspace_id and j.deleted_at is null
      inner join candidates c
        on c.id = a.candidate_id and c.workspace_id = a.workspace_id and c.deleted_at is null
      where a.workspace_id = ${workspaceId}
    )`;
}

/** The stage an application moved FROM, used to ignore hired-to-hired moves. */
const fromStage = alias(jobStages, "from_stage");

/** CTE bodies for `active_apps`, the hired applications and `hires`. */
export function hireCtesSql(workspaceId: string): SQL {
  return sql`
    ${activeAppsSql(workspaceId)},
    hired_apps as (
      select id, candidate_id, job_id, source, applied_at, updated_at
      from active_apps
      where status = 'hired'
    ),
    stage_hire as (
      -- A transition from one hired-kind stage to another (a stage merge, or a
      -- recruiter moving between two "hired" stages) is bookkeeping, not a new
      -- hire, so it must not move the hire date.
      select h.application_id, max(h.created_at) as hired_at
      from application_stage_history h
      inner join job_stages on job_stages.id = h.to_stage_id
      left join job_stages from_stage on from_stage.id = h.from_stage_id
      where h.workspace_id = ${workspaceId}
        and h.application_id in (select id from hired_apps)
        and ${stageIsKindSql(jobStages, "hired")}
        and (h.from_stage_id is null or not ${stageIsKindSql(fromStage, "hired")})
      group by h.application_id
    ),
    activity_hire as (
      select e.entity_id as application_id, min(e.created_at) as hired_at
      from activity_events e
      where e.workspace_id = ${workspaceId}
        and e.entity_type = 'application'
        and e.type = 'application.hired'
        and e.entity_id in (select id from hired_apps)
      group by e.entity_id
    ),
    hires as (
      select ha.id as application_id, ha.candidate_id, ha.job_id, ha.source, ha.applied_at,
        coalesce(sh.hired_at, ah.hired_at, ha.updated_at) as hired_at
      from hired_apps ha
      left join stage_hire sh on sh.application_id = ha.id
      left join activity_hire ah on ah.application_id = ha.id
    )`;
}

function rowsOf<T>(result: unknown): T[] {
  return result as unknown as T[];
}

function round1(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function wholePercent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/**
 * React.cache keys on argument identity, so windows are passed as primitives.
 * Two calls in one request for the same window share a single computation.
 */
function windowKey(window: ReportWindow): string {
  return [window.from.getTime(), window.to.getTime(), window.timeZone].join("|");
}

function windowFromKey(key: string): ReportWindow {
  const [from, to, timeZone] = key.split("|");
  return { from: new Date(Number(from)), to: new Date(Number(to)), timeZone, days: null };
}

function memoForWindow<T>(compute: (scope: ScopedWindow) => Promise<T>) {
  const cached = cache((workspaceId: string, key: string) =>
    compute({ workspaceId, window: windowFromKey(key) }),
  );
  return (scope: ScopedWindow): Promise<T> =>
    cached(scope.workspaceId, windowKey(scope.window));
}

// ── Workspace settings ──────────────────────────────────────────────────────

/** The workspace's reporting zone. NULL or unknown values resolve to UTC. */
export const getWorkspaceTimeZone = cache(async (workspaceId: string): Promise<string> => {
  const [row] = await db
    .select({ timezone: workspaceSettings.timezone })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  return normalizeTimeZone(row?.timezone);
});

// ── Population ──────────────────────────────────────────────────────────────

/** Current-state stock counts. Only open roles are a current-status metric. */
export async function getPopulationCounts(workspaceId: string) {
  const [openRoles, tracked] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.status, "open"), isNull(jobs.deletedAt))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(candidates)
      .where(and(eq(candidates.workspaceId, workspaceId), isNull(candidates.deletedAt))),
  ]);
  return { openRoles: openRoles[0]?.n ?? 0, candidatesAllTime: tracked[0]?.n ?? 0 };
}

async function computeApplicationsReceived({ workspaceId, window }: ScopedWindow): Promise<number> {
  const result = rowsOf<{ n: number }>(
    await db.execute(sql`
      with ${activeAppsSql(workspaceId)}
      select count(*)::int as n from active_apps
      where applied_at >= ${at(window.from)} and applied_at < ${at(window.to)}
    `),
  );
  return result[0]?.n ?? 0;
}

/** Applications received (applied_at in window). */
export const getApplicationsReceived = memoForWindow(computeApplicationsReceived);

// ── Hires and time to hire ──────────────────────────────────────────────────

const BUCKETS = TIME_TO_HIRE_BUCKETS.map(([bucket, min, max]) => ({ bucket, min, max }));

/**
 * Bucket membership on the whole-day value. `floor(d) in [min, max]` is the
 * same as `d in [min, max + 1)`, so SQL matches the JS bucketTimeToHire rule.
 */
function bucketPredicate(min: number, max: number): SQL {
  return max === Number.POSITIVE_INFINITY
    ? sql`d >= ${min}`
    : sql`d >= ${min} and d < ${max + 1}`;
}

async function computeHireStats({ workspaceId, window }: ScopedWindow): Promise<HireStats> {
  const bucketColumns = BUCKETS.map(
    (b, i) => sql`(select count(*)::int from durations where ${bucketPredicate(b.min, b.max)}) as b${sql.raw(String(i))}`,
  );
  const [row] = rowsOf<Record<string, number | string | null>>(
    await db.execute(sql`
      with ${hireCtesSql(workspaceId)},
      in_window as (
        select * from hires
        where hired_at >= ${at(window.from)} and hired_at < ${at(window.to)}
      ),
      durations as (
        select extract(epoch from (hired_at - applied_at)) / 86400.0 as d
        from in_window
        where hired_at >= applied_at
      )
      select
        (select count(*)::int from in_window) as hires,
        (select count(*)::int from durations) as measured,
        (select avg(d)::float8 from durations) as average_days,
        (select percentile_cont(0.5) within group (order by d)::float8 from durations) as median_days
        ${sql.join(
          bucketColumns.map((c) => sql`, ${c}`),
          sql``,
        )}
    `),
  );

  return {
    hires: Number(row?.hires ?? 0),
    measured: Number(row?.measured ?? 0),
    averageDays: round1(row?.average_days == null ? null : Number(row.average_days)),
    medianDays: round1(row?.median_days == null ? null : Number(row.median_days)),
    buckets: BUCKETS.map((b, i) => ({
      bucket: b.bucket,
      count: Number(row?.[`b${i}`] ?? 0),
    })),
  };
}

/** Hires, time to hire and distribution for hires dated in the window. */
export const getHireStats = memoForWindow(computeHireStats);

async function computeHiresByJob({ workspaceId, window }: ScopedWindow): Promise<Map<string, number>> {
  const rows = rowsOf<{ job_id: string; n: number }>(
    await db.execute(sql`
      with ${hireCtesSql(workspaceId)}
      select job_id, count(*)::int as n
      from hires
      where hired_at >= ${at(window.from)} and hired_at < ${at(window.to)}
      group by job_id
    `),
  );
  return new Map(rows.map((r) => [r.job_id, r.n]));
}

/** Hires per job (keyed by job id) dated in the window. */
export const getHiresByJob = memoForWindow(computeHiresByJob);

// ── Offers ──────────────────────────────────────────────────────────────────

async function computeOfferAcceptance({ workspaceId, window }: ScopedWindow): Promise<OfferAcceptance> {
  const [row] = rowsOf<{ accepted: number; declined: number }>(
    await db.execute(sql`
      select
        count(*) filter (where o.status = 'accepted')::int as accepted,
        count(*) filter (where o.status = 'declined')::int as declined
      from offers o
      inner join jobs j
        on j.id = o.job_id and j.workspace_id = o.workspace_id and j.deleted_at is null
      inner join candidates c
        on c.id = o.candidate_id and c.workspace_id = o.workspace_id and c.deleted_at is null
      where o.workspace_id = ${workspaceId}
        and o.status in ('accepted', 'declined')
        and o.decided_at >= ${at(window.from)} and o.decided_at < ${at(window.to)}
    `),
  );
  const accepted = Number(row?.accepted ?? 0);
  const declined = Number(row?.declined ?? 0);
  return { accepted, declined, rate: wholePercent(accepted, accepted + declined) };
}

/** Offer acceptance by decision date. The one definition for every surface. */
export const getOfferAcceptance = memoForWindow(computeOfferAcceptance);

// ── Headline KPIs ───────────────────────────────────────────────────────────

async function computeHiringKpis(scope: ScopedWindow): Promise<HiringKpis> {
  const [applications, hire, offers] = await Promise.all([
    getApplicationsReceived(scope),
    getHireStats(scope),
    getOfferAcceptance(scope),
  ]);
  return {
    applications,
    hires: hire.hires,
    averageTimeToHireDays: hire.averageDays,
    offers,
  };
}

/** Applications, hires, time to hire and offer acceptance for one window. */
export const getHiringKpis = memoForWindow(computeHiringKpis);

// ── Funnel ──────────────────────────────────────────────────────────────────

const FUNNEL_LABELS: Record<FunnelKind, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
};

async function computeWorkspaceFunnel({ workspaceId, window }: ScopedWindow): Promise<{
  applicationsReceived: number;
  stages: WorkspaceFunnelStage[];
}> {
  const cohortCte = sql`
    cohort as (
      select id, status, current_stage_id
      from active_apps
      where applied_at >= ${at(window.from)} and applied_at < ${at(window.to)}
    )`;
  const [reachRows, currentRows, receivedRows] = await Promise.all([
    db.execute(sql`
      with ${activeAppsSql(workspaceId)}, ${cohortCte},
      reach as (
        select h.application_id, ${effectiveStageKindSql(jobStages)} as kind
        from application_stage_history h
        inner join job_stages on job_stages.id = h.to_stage_id
        where h.workspace_id = ${workspaceId}
          and h.application_id in (select id from cohort)
        union
        select c.id, ${effectiveStageKindSql(jobStages)} as kind
        from cohort c
        inner join job_stages on job_stages.id = c.current_stage_id
      )
      select kind, count(distinct application_id)::int as n
      from reach
      group by kind
    `),
    db.execute(sql`
      with ${activeAppsSql(workspaceId)}, ${cohortCte}
      select ${effectiveStageKindSql(jobStages)} as kind, count(*)::int as n
      from cohort c
      inner join job_stages on job_stages.id = c.current_stage_id
      where c.status = 'active'
      group by 1
    `),
    computeApplicationsReceived({ workspaceId, window }),
  ]);

  const reached = new Map(rowsOf<{ kind: StageKind; n: number }>(reachRows).map((r) => [r.kind, r.n]));
  const current = new Map(rowsOf<{ kind: StageKind; n: number }>(currentRows).map((r) => [r.kind, r.n]));

  return {
    applicationsReceived: receivedRows,
    stages: FUNNEL_KINDS.map((kind) => {
      // Every application in the cohort was applied, so "applied" is the
      // whole cohort even for rows that predate stage history.
      const count = kind === "applied" ? receivedRows : (reached.get(kind) ?? 0);
      return {
        kind,
        label: FUNNEL_LABELS[kind],
        reached: count,
        pct: wholePercent(count, receivedRows),
        activeNow: current.get(kind) ?? 0,
      };
    }),
  };
}

/**
 * Workspace funnel by stage kind, across every job. Custom stages are not
 * part of this view; they appear in each job's own funnel by name.
 */
export const getWorkspaceFunnel = memoForWindow(computeWorkspaceFunnel);

/** Per-job funnel over that job's active stages, in pipeline order. */
export async function getJobFunnel({
  workspaceId,
  jobId,
  window,
}: ScopedWindow & { jobId: string }): Promise<{
  applicationsReceived: number;
  stages: JobFunnelStage[];
}> {
  const stageRows = await db
    .select({
      id: jobStages.id,
      name: jobStages.name,
      order: jobStages.order,
      kind: effectiveStageKindSql(jobStages),
    })
    .from(jobStages)
    .where(
      and(
        eq(jobStages.workspaceId, workspaceId),
        eq(jobStages.jobId, jobId),
        isNull(jobStages.archivedAt),
      ),
    )
    .orderBy(jobStages.order);

  const cohortCte = sql`
    cohort as (
      select id, status, current_stage_id
      from active_apps
      where job_id = ${jobId}::uuid
        and applied_at >= ${at(window.from)} and applied_at < ${at(window.to)}
    )`;
  const [reachRows, currentRows, receivedRows] = await Promise.all([
    db.execute(sql`
      with ${activeAppsSql(workspaceId)}, ${cohortCte},
      reach as (
        select h.application_id, h.to_stage_id as stage_id
        from application_stage_history h
        where h.workspace_id = ${workspaceId}
          and h.application_id in (select id from cohort)
        union
        select c.id, c.current_stage_id as stage_id from cohort c
      )
      select stage_id, count(distinct application_id)::int as n
      from reach
      group by stage_id
    `),
    db.execute(sql`
      with ${activeAppsSql(workspaceId)}, ${cohortCte}
      select current_stage_id as stage_id, count(*)::int as n
      from cohort
      where status = 'active'
      group by current_stage_id
    `),
    db.execute(sql`
      with ${activeAppsSql(workspaceId)}
      select count(*)::int as n from active_apps
      where job_id = ${jobId}::uuid
        and applied_at >= ${at(window.from)} and applied_at < ${at(window.to)}
    `),
  ]);

  const reached = new Map(rowsOf<{ stage_id: string; n: number }>(reachRows).map((r) => [r.stage_id, r.n]));
  const current = new Map(rowsOf<{ stage_id: string; n: number }>(currentRows).map((r) => [r.stage_id, r.n]));
  const received = rowsOf<{ n: number }>(receivedRows)[0]?.n ?? 0;

  return {
    applicationsReceived: received,
    stages: stageRows.map((stage) => {
      const count = reached.get(stage.id) ?? 0;
      return {
        stageId: stage.id,
        name: stage.name,
        kind: stage.kind,
        order: stage.order,
        reached: count,
        pct: wholePercent(count, received),
        activeNow: current.get(stage.id) ?? 0,
      };
    }),
  };
}

// ── Sources ─────────────────────────────────────────────────────────────────

async function computeSourceEffectiveness({ workspaceId, window }: ScopedWindow): Promise<SourceEffectiveness[]> {
  const [applicationRows, hireRows] = await Promise.all([
    db.execute(sql`
      with ${activeAppsSql(workspaceId)}
      select coalesce(source, 'unknown') as source, count(*)::int as n
      from active_apps
      where applied_at >= ${at(window.from)} and applied_at < ${at(window.to)}
      group by 1
    `),
    db.execute(sql`
      with ${hireCtesSql(workspaceId)}
      select coalesce(source, 'unknown') as source, count(*)::int as n
      from hires
      where hired_at >= ${at(window.from)} and hired_at < ${at(window.to)}
      group by 1
    `),
  ]);

  const applicationsBySource = new Map(rowsOf<{ source: string; n: number }>(applicationRows).map((r) => [r.source, r.n]));
  const hiresBySource = new Map(rowsOf<{ source: string; n: number }>(hireRows).map((r) => [r.source, r.n]));
  const sources = new Set([...applicationsBySource.keys(), ...hiresBySource.keys()]);

  return [...sources]
    .map((source) => {
      const applicationCount = applicationsBySource.get(source) ?? 0;
      const hireCount = hiresBySource.get(source) ?? 0;
      return {
        source,
        applications: applicationCount,
        hires: hireCount,
        conversion: wholePercent(hireCount, applicationCount),
      };
    })
    .sort((a, b) => b.applications - a.applications || b.hires - a.hires || a.source.localeCompare(b.source));
}

/** Applications and hires per source, with the window's hire rule. */
export const getSourceEffectiveness = memoForWindow(computeSourceEffectiveness);

// ── Time series (zone-local buckets, computed in SQL) ───────────────────────

export type SeriesMetric = "applications" | "hires" | "interviews";

async function computeDailyCounts(
  { workspaceId, window }: ScopedWindow,
  metric: SeriesMetric,
): Promise<Map<string, number>> {
  const tz = window.timeZone;
  let result: unknown;
  if (metric === "applications") {
    result = await db.execute(sql`
      with ${activeAppsSql(workspaceId)}
      select to_char(applied_at at time zone ${tz}, 'YYYY-MM-DD') as bucket, count(*)::int as n
      from active_apps
      where applied_at >= ${at(window.from)} and applied_at < ${at(window.to)}
      group by 1
    `);
  } else if (metric === "hires") {
    result = await db.execute(sql`
      with ${hireCtesSql(workspaceId)}
      select to_char(hired_at at time zone ${tz}, 'YYYY-MM-DD') as bucket, count(*)::int as n
      from hires
      where hired_at >= ${at(window.from)} and hired_at < ${at(window.to)}
      group by 1
    `);
  } else {
    result = await db.execute(sql`
      select to_char(i.scheduled_at at time zone ${tz}, 'YYYY-MM-DD') as bucket, count(*)::int as n
      from interviews i
      inner join candidates c
        on c.id = i.candidate_id and c.workspace_id = i.workspace_id and c.deleted_at is null
      inner join jobs j
        on j.id = i.job_id and j.workspace_id = i.workspace_id and j.deleted_at is null
      where i.workspace_id = ${workspaceId}
        and i.status <> 'canceled'
        and i.scheduled_at >= ${at(window.from)} and i.scheduled_at < ${at(window.to)}
      group by 1
    `);
  }
  return new Map(rowsOf<{ bucket: string; n: number }>(result).map((r) => [r.bucket, r.n]));
}

/**
 * One count per local day in the window, zero-filled, oldest first. The
 * window must be a day window (`days` set).
 */
export async function getDailySeries(
  scope: ScopedWindow,
  metric: SeriesMetric,
): Promise<{ key: string; count: number }[]> {
  const counts = await computeDailyCounts(scope, metric);
  return dayKeysInWindow(scope.window).map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

async function computeMonthlyCounts(
  { workspaceId, window }: ScopedWindow,
  metric: "applications" | "hires",
): Promise<Map<string, number>> {
  const tz = window.timeZone;
  const result =
    metric === "applications"
      ? await db.execute(sql`
          with ${activeAppsSql(workspaceId)}
          select to_char(applied_at at time zone ${tz}, 'YYYY-MM') as bucket, count(*)::int as n
          from active_apps
          where applied_at >= ${at(window.from)} and applied_at < ${at(window.to)}
          group by 1
        `)
      : await db.execute(sql`
          with ${hireCtesSql(workspaceId)}
          select to_char(hired_at at time zone ${tz}, 'YYYY-MM') as bucket, count(*)::int as n
          from hires
          where hired_at >= ${at(window.from)} and hired_at < ${at(window.to)}
          group by 1
        `);
  return new Map(rowsOf<{ bucket: string; n: number }>(result).map((r) => [r.bucket, r.n]));
}

/** Monthly counts keyed by zone-local `YYYY-MM`, for a window of whole months. */
export const getMonthlyCounts = computeMonthlyCounts;
