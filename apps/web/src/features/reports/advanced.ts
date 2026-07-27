import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import {
  applications,
  candidateDemographics,
  candidates,
  db,
  jobs,
} from "@harly/db";

import { getHiringEvents } from "./data";

export type StageSlaRow = {
  stage: string;
  transitions: number;
  averageDays: number | null;
  p50Days: number | null;
  breached: number;
};

export type DiversityRow = {
  dimension: "gender" | "ethnicity" | "disability" | "veteranStatus";
  value: string;
  applicants: number;
  hires: number;
  conversion: number;
};

export type AdvancedHiringAnalytics = {
  stageSla: StageSlaRow[];
  diversity: DiversityRow[];
  sourceOfHire: Array<{ source: string; applicants: number; hires: number; conversion: number }>;
  generatedAt: string;
};

const SLA_DAYS = 7;

/**
 * Stage SLA uses the durable stage history, not UI timestamps. The next
 * transition is calculated per application, so moving backwards or across
 * custom pipelines remains measurable and tenant-safe.
 */
export async function getAdvancedHiringAnalytics(
  workspaceId: string,
  options: { since?: Date } = {},
): Promise<AdvancedHiringAnalytics> {
  const since = options.since?.toISOString() ?? new Date(0).toISOString();
  const slaRows = (await db.execute(sql`
    with transitions as (
      select
        h.application_id,
        s.name as stage,
        h.created_at,
        lead(h.created_at) over (
          partition by h.application_id order by h.created_at, h.id
        ) as next_at
      from application_stage_history h
      inner join job_stages s on s.id = h.to_stage_id
      inner join applications a on a.id = h.application_id and a.workspace_id = ${workspaceId}
      inner join jobs j on j.id = a.job_id and j.workspace_id = ${workspaceId} and j.deleted_at is null
      where h.workspace_id = ${workspaceId}
        and h.created_at >= ${since}::timestamptz
    ), durations as (
      select stage, extract(epoch from (next_at - created_at)) / 86400.0 as days
      from transitions where next_at is not null and next_at >= created_at
    )
    select stage,
      count(*)::int as transitions,
      round(avg(days)::numeric, 2)::float8 as average_days,
      percentile_cont(0.5) within group (order by days)::float8 as p50_days,
      count(*) filter (where days > ${SLA_DAYS})::int as breached
    from durations group by stage order by average_days desc
  `)) as unknown as Array<Record<string, unknown>>;

  const dimensions = [
    ["gender", candidateDemographics.gender],
    ["ethnicity", candidateDemographics.ethnicity],
    ["disability", candidateDemographics.disability],
    ["veteranStatus", candidateDemographics.veteranStatus],
  ] as const;
  const diversity: DiversityRow[] = [];
  for (const [dimension, column] of dimensions) {
    const rows = await db
      .select({
        value: column,
        applicants: sql<number>`count(distinct ${applications.id})::int`,
        hires: sql<number>`count(distinct ${applications.id}) filter (where ${applications.status} = 'hired')::int`,
      })
      .from(candidateDemographics)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, candidateDemographics.candidateId),
          eq(candidates.workspaceId, workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        applications,
        and(
          eq(applications.candidateId, candidates.id),
          eq(applications.workspaceId, workspaceId),
        ),
      )
      .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt)))
      .where(sql`${column} is not null and ${column} <> ''`)
      .groupBy(column);
    for (const row of rows) {
      const applicants = row.applicants ?? 0;
      diversity.push({
        dimension,
        value: row.value ?? "unknown",
        applicants,
        hires: row.hires ?? 0,
        conversion: applicants > 0 ? Math.round(((row.hires ?? 0) / applicants) * 100) : 0,
      });
    }
  }

  const sourceRows = await db
    .select({
      source: sql<string>`coalesce(${applications.source}, 'unknown')`,
      applicants: sql<number>`count(*)::int`,
      hires: sql<number>`count(*) filter (where ${applications.status} = 'hired')::int`,
    })
    .from(applications)
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt)))
    .where(eq(applications.workspaceId, workspaceId))
    .groupBy(sql`coalesce(${applications.source}, 'unknown')`);

  // Touch the canonical event query here so scheduled reports and the UI use
  // the same definition of a hire/time-to-hire.
  await getHiringEvents(workspaceId, options);

  return {
    stageSla: slaRows.map((row) => ({
      stage: String(row.stage),
      transitions: Number(row.transitions ?? 0),
      averageDays: row.average_days == null ? null : Number(row.average_days),
      p50Days: row.p50_days == null ? null : Number(row.p50_days),
      breached: Number(row.breached ?? 0),
    })),
    diversity,
    sourceOfHire: sourceRows.map((row) => ({
      source: row.source,
      applicants: row.applicants,
      hires: row.hires,
      conversion: row.applicants > 0 ? Math.round((row.hires / row.applicants) * 100) : 0,
    })),
    generatedAt: new Date().toISOString(),
  };
}
