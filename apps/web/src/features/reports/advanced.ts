import "server-only";

import { sql } from "drizzle-orm";

import {
  STAGE_KIND_LABELS,
  candidateDemographics,
  db,
  effectiveStageKindSql,
  jobStages,
  type StageKind,
} from "@harly/db";

import {
  activeAppsSql,
  getSourceEffectiveness,
  hireCtesSql,
  type ScopedWindow,
} from "./canonical";

/**
 * Advanced hiring analytics: stage SLA, diversity and source of hire.
 *
 * Every population here is the canonical active population (candidate and job
 * not soft-deleted), and every hire is a canonical hire.
 */

const SLA_DAYS = 7;

/** Diversity cells with fewer applicants than this are suppressed. */
export const MIN_DIVERSITY_CELL_SIZE = 5;

export type StageSlaRow = {
  /** Stage kind label, or the stage's own name for custom stages. */
  stage: string;
  kind: StageKind;
  transitions: number;
  averageDays: number | null;
  p50Days: number | null;
  breached: number;
};

export type DiversityDimension = "gender" | "ethnicity" | "disability" | "veteranStatus";

export type DiversityRow =
  | {
      dimension: DiversityDimension;
      value: string;
      suppressed: false;
      applicants: number;
      hires: number;
      conversion: number | null;
    }
  | {
      dimension: DiversityDimension;
      value: string;
      /** Set when the cell is below MIN_DIVERSITY_CELL_SIZE. No counts are returned. */
      suppressed: true;
    };

export type AdvancedHiringAnalytics = {
  window: { from: string; to: string; timeZone: string };
  stageSla: StageSlaRow[];
  diversity: DiversityRow[];
  sourceOfHire: Array<{
    source: string;
    applicants: number;
    hires: number;
    conversion: number | null;
  }>;
  generatedAt: string;
};

/**
 * Stage SLA: time spent in each stage before the next transition, for
 * transitions that started in the window. Stages are grouped by kind, so a
 * renamed Hired stage stays in the same row.
 */
async function getStageSla({ workspaceId, window }: ScopedWindow): Promise<StageSlaRow[]> {
  const rows = (await db.execute(sql`
    with ${activeAppsSql(workspaceId)},
    transitions as (
      select
        h.application_id,
        ${effectiveStageKindSql(jobStages)} as kind,
        job_stages.name as stage_name,
        h.created_at,
        lead(h.created_at) over (
          partition by h.application_id order by h.created_at, h.id
        ) as next_at
      from application_stage_history h
      inner join job_stages on job_stages.id = h.to_stage_id
      where h.workspace_id = ${workspaceId}
        and h.application_id in (select id from active_apps)
    ),
    durations as (
      select
        kind,
        case when kind = 'custom' then stage_name else null end as custom_name,
        extract(epoch from (next_at - created_at)) / 86400.0 as days
      from transitions
      where next_at is not null
        and next_at >= created_at
        and created_at >= ${window.from.toISOString()}::timestamptz
        and created_at < ${window.to.toISOString()}::timestamptz
    )
    select
      kind,
      custom_name,
      count(*)::int as transitions,
      round(avg(days)::numeric, 2)::float8 as average_days,
      percentile_cont(0.5) within group (order by days)::float8 as p50_days,
      count(*) filter (where days > ${SLA_DAYS})::int as breached
    from durations
    group by kind, custom_name
    order by average_days desc nulls last
  `)) as unknown as Array<{
    kind: StageKind;
    custom_name: string | null;
    transitions: number;
    average_days: number | null;
    p50_days: number | null;
    breached: number;
  }>;

  return rows.map((row) => ({
    stage: row.kind === "custom" ? (row.custom_name ?? "Custom") : STAGE_KIND_LABELS[row.kind],
    kind: row.kind,
    transitions: Number(row.transitions),
    averageDays: row.average_days == null ? null : Number(row.average_days),
    p50Days: row.p50_days == null ? null : Number(row.p50_days),
    breached: Number(row.breached),
  }));
}

const DIMENSIONS = [
  ["gender", candidateDemographics.gender],
  ["ethnicity", candidateDemographics.ethnicity],
  ["disability", candidateDemographics.disability],
  ["veteranStatus", candidateDemographics.veteranStatus],
] as const;

/**
 * Applicants are the canonical active applications received in the window.
 * Hires are the canonical hires dated in the window among those applications,
 * the same hire rule the Hires card uses.
 */
async function getDiversity({ workspaceId, window }: ScopedWindow): Promise<DiversityRow[]> {
  const from = window.from.toISOString();
  const to = window.to.toISOString();
  const rows: DiversityRow[] = [];

  for (const [dimension, column] of DIMENSIONS) {
    const cells = (await db.execute(sql`
      with ${hireCtesSql(workspaceId)},
      cohort as (
        select id, candidate_id from active_apps
        where applied_at >= ${from}::timestamptz and applied_at < ${to}::timestamptz
      )
      select
        ${column} as value,
        count(distinct cohort.id)::int as applicants,
        count(distinct cohort.id) filter (
          where cohort.id in (
            select application_id from hires
            where hired_at >= ${from}::timestamptz and hired_at < ${to}::timestamptz
          )
        )::int as hires
      from cohort
      inner join candidate_demographics
        on candidate_demographics.candidate_id = cohort.candidate_id
        and candidate_demographics.workspace_id = ${workspaceId}
      where ${column} is not null and ${column} <> ''
      group by ${column}
    `)) as unknown as Array<{ value: string; applicants: number; hires: number }>;

    for (const cell of cells) {
      const applicants = Number(cell.applicants);
      if (applicants < MIN_DIVERSITY_CELL_SIZE) {
        rows.push({ dimension, value: cell.value, suppressed: true });
        continue;
      }
      const hires = Number(cell.hires);
      rows.push({
        dimension,
        value: cell.value,
        suppressed: false,
        applicants,
        hires,
        conversion: Math.round((hires / applicants) * 100),
      });
    }
  }

  return rows;
}

/** Stage SLA, diversity and source of hire for applications in the window. */
export async function getAdvancedHiringAnalytics({
  workspaceId,
  window,
}: ScopedWindow): Promise<AdvancedHiringAnalytics> {
  const [stageSla, diversity, sources] = await Promise.all([
    getStageSla({ workspaceId, window }),
    getDiversity({ workspaceId, window }),
    getSourceEffectiveness({ workspaceId, window }),
  ]);

  return {
    window: {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      timeZone: window.timeZone,
    },
    stageSla,
    diversity,
    sourceOfHire: sources.map((row) => ({
      source: row.source,
      applicants: row.applications,
      hires: row.hires,
      conversion: row.conversion,
    })),
    generatedAt: new Date().toISOString(),
  };
}
