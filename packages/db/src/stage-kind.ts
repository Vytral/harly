import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * Pipeline stage semantics.
 *
 * A stage's *kind* is what the product means by it (a hire, a rejection, an
 * offer), independent of the name a recruiter gave it. Every consumer that
 * needs to know "is this the hired stage?" must go through this module and
 * never compare stage names. Stage names are display text.
 *
 * `job_stages.kind` is nullable on purpose: rows written by a pre-0.2.4 build
 * carry NULL, and an operator may roll the application image back after
 * upgrading. {@link effectiveStageKind} and {@link effectiveStageKindSql}
 * classify such rows by their legacy name, so both application and reporting
 * code keep working. Migration 0154 applies the same mapping once to stored
 * data (see {@link LEGACY_STAGE_NAME_KINDS}).
 */

export const STAGE_KINDS = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
  "custom",
] as const;

export type StageKind = (typeof STAGE_KINDS)[number];

export const TERMINAL_STAGE_KINDS = ["hired", "rejected", "withdrawn"] as const;
export type TerminalStageKind = (typeof TERMINAL_STAGE_KINDS)[number];

/** Mirrors the `application_status` enum values an application can hold. */
export type ApplicationOutcome = "active" | "hired" | "rejected" | "withdrawn";

export const STAGE_KIND_LABELS: Record<StageKind, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  custom: "Custom",
};

/**
 * Lowercased, trimmed stage names that older builds relied on, and the kind
 * each one maps to. The only legitimate reader is the legacy fallback below
 * and the 0154 backfill migration, which must stay in sync with this table.
 */
export const LEGACY_STAGE_NAME_KINDS: Readonly<Record<string, StageKind>> = {
  applied: "applied",
  screening: "screening",
  interview: "interview",
  offer: "offer",
  hired: "hired",
  rejected: "rejected",
  withdrawn: "withdrawn",
};

export function isStageKind(value: unknown): value is StageKind {
  return (
    typeof value === "string" && (STAGE_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Characters ignored at either end of a stage name when classifying it. An
 * explicit set (rather than JavaScript's `trim()` vs Postgres `btrim()`, which
 * disagree about tabs, newlines and no-break spaces) keeps TypeScript, the SQL
 * helpers and the 0154 backfill migration in exact agreement.
 */
export const STAGE_NAME_TRIM_CHARS = " \t\n\r\f\v\u00a0";

function trimStageName(name: string): string {
  let start = 0;
  let end = name.length;
  while (start < end && STAGE_NAME_TRIM_CHARS.includes(name[start])) start += 1;
  while (end > start && STAGE_NAME_TRIM_CHARS.includes(name[end - 1])) end -= 1;
  return name.slice(start, end);
}

/** Classify a stage by its legacy display name. Unknown names are `custom`. */
export function inferStageKindFromName(name: string): StageKind {
  return LEGACY_STAGE_NAME_KINDS[trimStageName(name).toLowerCase()] ?? "custom";
}

export type StageKindSource = {
  kind?: StageKind | null;
  name: string;
};

/** The kind to use for a stage row, tolerating rows with a NULL kind. */
export function effectiveStageKind(stage: StageKindSource): StageKind {
  return stage.kind ?? inferStageKindFromName(stage.name);
}

export function isTerminalStageKind(kind: StageKind): kind is TerminalStageKind {
  return (TERMINAL_STAGE_KINDS as readonly string[]).includes(kind);
}

/** The application status that results from sitting in a stage of this kind. */
export function applicationStatusForStageKind(kind: StageKind): ApplicationOutcome {
  return isTerminalStageKind(kind) ? kind : "active";
}

export function applicationStatusForStage(stage: StageKindSource): ApplicationOutcome {
  return applicationStatusForStageKind(effectiveStageKind(stage));
}

/** Terminal stage kind that corresponds to a terminal application status. */
export function stageKindForOutcome(
  outcome: Exclude<ApplicationOutcome, "active">,
): TerminalStageKind {
  return outcome;
}

export type StageLike = StageKindSource & {
  id: string;
  order: number;
  archivedAt?: Date | string | null;
};

/** Stages still part of the pipeline, in board order. */
export function activeStages<T extends StageLike>(stages: readonly T[]): T[] {
  return stages
    .filter((stage) => !stage.archivedAt)
    .sort((a, b) => a.order - b.order);
}

/** First (lowest order) active stage of a kind, or null. */
export function findStageByKind<T extends StageLike>(
  stages: readonly T[],
  kind: StageKind,
): T | null {
  return (
    activeStages(stages).find((stage) => effectiveStageKind(stage) === kind) ??
    null
  );
}

/**
 * Where a brand-new application lands: the first active non-terminal stage.
 * Previously callers assumed "the stage with the lowest order", which breaks
 * as soon as a pipeline starts with a terminal or archived stage.
 */
export function entryStage<T extends StageLike>(stages: readonly T[]): T | null {
  return (
    activeStages(stages).find(
      (stage) => !isTerminalStageKind(effectiveStageKind(stage)),
    ) ?? null
  );
}

export function normalizeStageName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export type PipelineShapeIssue =
  | { code: "no_active_stage" }
  | { code: "duplicate_name"; name: string }
  | { code: "empty_name" };

/**
 * Hard invariants every job pipeline must keep after any lifecycle change:
 * at least one active non-terminal stage (otherwise there is nowhere for a new
 * application to land), and unique names (case-insensitive) among active stages.
 */
export function validatePipelineShape(
  stages: readonly (StageKindSource & { archivedAt?: Date | string | null })[],
): PipelineShapeIssue[] {
  const issues: PipelineShapeIssue[] = [];
  const live = stages.filter((stage) => !stage.archivedAt);
  const seen = new Set<string>();
  for (const stage of live) {
    const name = normalizeStageName(stage.name);
    if (!name) {
      issues.push({ code: "empty_name" });
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) issues.push({ code: "duplicate_name", name });
    seen.add(key);
  }
  if (!live.some((s) => !isTerminalStageKind(effectiveStageKind(s)))) {
    issues.push({ code: "no_active_stage" });
  }
  return issues;
}

export type DefaultStageDefinition = {
  name: string;
  color: string;
  kind: StageKind;
};

/**
 * The pipeline every new job starts with. This is the single source of truth:
 * job creation (UI and API), the AI job tool and demo seeding all read it.
 */
export const DEFAULT_PIPELINE_STAGES: readonly DefaultStageDefinition[] = [
  { name: "Applied", color: "#E0F2FE", kind: "applied" },
  { name: "Screening", color: "#F5F3FF", kind: "screening" },
  { name: "Interview", color: "#FEF3C7", kind: "interview" },
  { name: "Offer", color: "#DCFCE7", kind: "offer" },
  { name: "Hired", color: "#CCFBF1", kind: "hired" },
  { name: "Rejected", color: "#FEE2E2", kind: "rejected" },
];

/** Default stage rows ready to insert for a job. */
export function defaultStageRows(input: {
  workspaceId: string;
  jobId: string;
}): Array<{
  workspaceId: string;
  jobId: string;
  name: string;
  color: string;
  kind: StageKind;
  order: number;
}> {
  return DEFAULT_PIPELINE_STAGES.map((stage, index) => ({
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    name: stage.name,
    color: stage.color,
    kind: stage.kind,
    order: index,
  }));
}

/**
 * SQL equivalent of {@link effectiveStageKind} for a `job_stages` alias:
 * `coalesce(kind, <legacy name mapping>)`. Use it in every query that needs
 * stage meaning so SQL and TypeScript agree, including for NULL-kind rows.
 */
export function effectiveStageKindSql(stage: {
  kind: AnyColumn;
  name: AnyColumn;
}): SQL<StageKind> {
  const branches = Object.entries(LEGACY_STAGE_NAME_KINDS).map(
    ([name, kind]) => sql`when ${name} then ${kind}`,
  );
  return sql<StageKind>`coalesce(${stage.kind}::text, case lower(btrim(${stage.name}, ${STAGE_NAME_TRIM_CHARS})) ${sql.join(branches, sql` `)} else 'custom' end)`;
}

/** SQL predicate: the stage is of the given kind (NULL-kind rows included). */
export function stageIsKindSql(
  stage: { kind: AnyColumn; name: AnyColumn },
  kind: StageKind,
): SQL<boolean> {
  return sql<boolean>`${effectiveStageKindSql(stage)} = ${kind}`;
}

/** SQL predicate: the stage is one of several kinds. */
export function stageIsAnyKindSql(
  stage: { kind: AnyColumn; name: AnyColumn },
  kinds: readonly StageKind[],
): SQL<boolean> {
  return sql<boolean>`${effectiveStageKindSql(stage)} in (${sql.join(
    kinds.map((kind) => sql`${kind}`),
    sql`, `,
  )})`;
}
