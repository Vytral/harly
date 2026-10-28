import "server-only";

import { and, asc, eq, isNull, max } from "drizzle-orm";

import {
  STAGE_KIND_LABELS,
  DEFAULT_PIPELINE_STAGES,
  db,
  effectiveStageKind,
  entryStage,
  findStageByKind,
  jobStages,
  normalizeStageName,
  type JobStage,
  type StageKind,
} from "@harly/db";

/** A database handle or an open transaction. */
export type StageExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

type JobScope = { workspaceId: string; jobId: string };

/** Active (non-archived) stages of a job in board order. */
export async function listActiveJobStages(
  executor: StageExecutor,
  scope: JobScope,
): Promise<JobStage[]> {
  return executor
    .select()
    .from(jobStages)
    .where(
      and(
        eq(jobStages.workspaceId, scope.workspaceId),
        eq(jobStages.jobId, scope.jobId),
        isNull(jobStages.archivedAt),
      ),
    )
    .orderBy(asc(jobStages.order));
}

/**
 * The stage a brand-new application (apply form, import, pool add, restore)
 * lands in: the first active non-terminal stage.
 */
export async function resolveEntryStage(
  executor: StageExecutor,
  scope: JobScope,
): Promise<JobStage | null> {
  return entryStage(await listActiveJobStages(executor, scope));
}

/** First active stage of the given kind, or null when the job has none. */
export async function resolveStageByKind(
  executor: StageExecutor,
  scope: JobScope & { kind: StageKind },
): Promise<JobStage | null> {
  return findStageByKind(await listActiveJobStages(executor, scope), scope.kind);
}

const MAX_ENSURE_ATTEMPTS = 3;

function defaultNameForKind(kind: StageKind): string {
  return (
    DEFAULT_PIPELINE_STAGES.find((stage) => stage.kind === kind)?.name ??
    STAGE_KIND_LABELS[kind]
  );
}

function defaultColorForKind(kind: StageKind): string | null {
  return DEFAULT_PIPELINE_STAGES.find((stage) => stage.kind === kind)?.color ?? null;
}

/**
 * Return the job's stage of this kind, creating one at the end of the pipeline
 * when it has none. This is how a terminal outcome (hired, rejected,
 * withdrawn) always has a stage to be recorded against, so stage history -
 * and every metric derived from it - never misses an outcome because someone
 * renamed or removed the default stage.
 *
 * Must run inside the caller's transaction so the new stage commits or rolls
 * back together with the move that needed it. Safe under concurrency: a lost
 * race on the unique name/order indexes re-reads the winner's stage.
 */
export async function ensureStageOfKind(
  tx: StageExecutor,
  scope: JobScope & { kind: StageKind },
): Promise<JobStage> {
  for (let attempt = 0; attempt < MAX_ENSURE_ATTEMPTS; attempt += 1) {
    const stages = await listActiveJobStages(tx, scope);
    const existing = findStageByKind(stages, scope.kind);
    if (existing) return existing;

    const [{ lastOrder }] = await tx
      .select({ lastOrder: max(jobStages.order) })
      .from(jobStages)
      .where(
        and(
          eq(jobStages.workspaceId, scope.workspaceId),
          eq(jobStages.jobId, scope.jobId),
          isNull(jobStages.archivedAt),
        ),
      );

    const taken = new Set(
      stages.map((stage) => normalizeStageName(stage.name).toLowerCase()),
    );
    let name = defaultNameForKind(scope.kind);
    for (let suffix = 2; taken.has(name.toLowerCase()); suffix += 1) {
      name = `${defaultNameForKind(scope.kind)} (${suffix})`;
    }

    const [created] = await tx
      .insert(jobStages)
      .values({
        workspaceId: scope.workspaceId,
        jobId: scope.jobId,
        name,
        color: defaultColorForKind(scope.kind),
        kind: scope.kind,
        order: (lastOrder ?? -1) + 1,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
  }

  throw new Error(
    `Could not create a ${scope.kind} stage for job ${scope.jobId}; please retry.`,
  );
}

/** Convenience for callers holding a stage row: its resolved kind. */
export function kindOf(stage: Pick<JobStage, "kind" | "name">): StageKind {
  return effectiveStageKind(stage);
}
