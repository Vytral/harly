import "server-only";

import { and, asc, eq, isNull, max } from "drizzle-orm";

import {
  STAGE_KIND_LABELS,
  DEFAULT_PIPELINE_STAGES,
  db,
  effectiveStageKind,
  entryStage,
  findStageByKind,
  jobs,
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

/**
 * Lock the job row for the rest of the caller's transaction. Every stage
 * lifecycle change (create, update, reorder, archive, delete) locks the job
 * first, so once this returns no stage of the job can change its kind, name or
 * archived state until the caller commits. Reads made after it see the
 * committed pipeline.
 */
export async function lockJobForStageChoice(
  tx: StageExecutor,
  scope: JobScope,
): Promise<void> {
  await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, scope.jobId), eq(jobs.workspaceId, scope.workspaceId)))
    .for("update");
}

/**
 * Lock one active stage row FOR SHARE for the rest of the caller's transaction
 * and return it as it is now committed. A placement into a known stage calls
 * this before it derives the application status from the stage kind. A kind
 * change takes the row FOR UPDATE, so it either commits before this read or
 * waits until the placement commits and then sees the application.
 * Returns null when the stage is missing or archived.
 */
export async function lockStageForPlacement(
  tx: StageExecutor,
  input: { workspaceId: string; stageId: string },
): Promise<JobStage | null> {
  const [stage] = await tx
    .select()
    .from(jobStages)
    .where(
      and(
        eq(jobStages.workspaceId, input.workspaceId),
        eq(jobStages.id, input.stageId),
        isNull(jobStages.archivedAt),
      ),
    )
    .for("share")
    .limit(1);
  return stage ?? null;
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
  // Serialize with stage lifecycle changes so a concurrent createStage of the
  // same name, or a kind change, cannot interleave with this read.
  await lockJobForStageChoice(tx, scope);
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
