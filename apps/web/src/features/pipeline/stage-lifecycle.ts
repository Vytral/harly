import "server-only";

import { and, asc, count, eq, isNull, max, or, sql } from "drizzle-orm";

import { ApiError } from "@harly/api";
import {
  activeStages,
  activityEvents,
  applications,
  applicationStageHistory,
  db,
  documentRequirements,
  effectiveStageKind,
  isTerminalStageKind,
  jobs,
  jobStages,
  normalizeStageName,
  scorecards,
  validatePipelineShape,
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowDrafts,
  type JobStage,
  type PipelineShapeIssue,
  type StageKind,
} from "@harly/db";

/**
 * Stage lifecycle for a single job after creation: add, rename or recolor,
 * change kind, reorder, archive (merging applications), and hard delete.
 *
 * Session-free like `features/jobs/service.ts`: every function takes the
 * workspace and job explicitly, so the REST API and the server actions share
 * exactly the same rules. Every mutation runs in one transaction that first
 * locks the job row, which serializes lifecycle changes per job, and then
 * re-checks the resulting pipeline before anything is written.
 */

/** Temporary order values used while rewriting the partial unique index. */
const TEMP_REORDER_BASE = 1_000_000;
const TEMP_INSERT_ORDER = 1_000_000_000;

export type StageEmailConfig = { candidateUpdatesEnabled: boolean };

/** A stage with its effective kind resolved and its application count. */
export type JobStageSummary = Omit<JobStage, "kind"> & {
  kind: StageKind;
  applicationCount: number;
};

export type StagePatch = {
  name?: string;
  color?: string | null;
  kind?: StageKind;
  emailConfig?: StageEmailConfig;
};

export type ArchiveStageResult = {
  stage: JobStageSummary;
  movedApplications: number;
};

type JobScope = { workspaceId: string; jobId: string };
type ActorScope = JobScope & { actorUserId: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

/** Accepts the loose stored shape and returns a valid email config, or undefined. */
export function parseStageEmailConfig(value: unknown): StageEmailConfig | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "candidateUpdatesEnabled" in value &&
    typeof value.candidateUpdatesEnabled === "boolean"
  ) {
    return { candidateUpdatesEnabled: value.candidateUpdatesEnabled };
  }
  return undefined;
}

function toSummary(stage: JobStage, applicationCount: number): JobStageSummary {
  return { ...stage, kind: effectiveStageKind(stage), applicationCount };
}

/** Application counts for every stage of one job, keyed by stage id. */
async function countsByStage(
  executor: Executor,
  scope: JobScope,
): Promise<Map<string, number>> {
  const rows = await executor
    .select({ stageId: applications.currentStageId, total: count() })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, scope.workspaceId),
        eq(applications.jobId, scope.jobId),
      ),
    )
    .groupBy(applications.currentStageId);
  return new Map(rows.map((row) => [row.stageId, Number(row.total)]));
}

async function countApplicationsInStage(
  executor: Executor,
  scope: JobScope,
  stageId: string,
): Promise<number> {
  const [row] = await executor
    .select({ total: count() })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, scope.workspaceId),
        eq(applications.jobId, scope.jobId),
        eq(applications.currentStageId, stageId),
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * Serialize concurrent lifecycle operations on one job. Also verifies the job
 * belongs to the workspace and has not been soft-deleted.
 */
/**
 * Lock the given stage rows (always in id order, so concurrent lifecycle
 * operations cannot deadlock). The row lock waits for every in-flight
 * transaction that is placing an application into one of these stages, so the
 * application count and move that follow see a committed, stable set. The
 * `enforce_application_stage_active` trigger covers the other direction: a
 * placement that starts after the archive commits is refused.
 */
async function lockStageRows(
  tx: Tx,
  scope: JobScope,
  stageIds: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  const ids = [...new Set(stageIds.filter((id): id is string => Boolean(id)))].sort();
  if (ids.length === 0) return;
  await tx.execute(sql`
    select id from job_stages
    where workspace_id = ${scope.workspaceId}
      and job_id = ${scope.jobId}
      and id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
    order by id
    for update
  `);
}

async function lockJob(tx: Tx, scope: JobScope): Promise<void> {
  const [job] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.id, scope.jobId),
        eq(jobs.workspaceId, scope.workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .for("update");
  if (!job) throw ApiError.notFound("Job not found.");
}

async function loadStages(executor: Executor, scope: JobScope): Promise<JobStage[]> {
  return executor
    .select()
    .from(jobStages)
    .where(
      and(
        eq(jobStages.workspaceId, scope.workspaceId),
        eq(jobStages.jobId, scope.jobId),
      ),
    )
    .orderBy(asc(jobStages.order));
}

function findStage(stages: readonly JobStage[], stageId: string): JobStage {
  const stage = stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw ApiError.notFound("Job stage not found.");
  return stage;
}

async function readSummary(
  executor: Executor,
  scope: JobScope,
  stageId: string,
): Promise<JobStageSummary> {
  const [stage] = await executor
    .select()
    .from(jobStages)
    .where(
      and(
        eq(jobStages.id, stageId),
        eq(jobStages.workspaceId, scope.workspaceId),
        eq(jobStages.jobId, scope.jobId),
      ),
    );
  if (!stage) throw ApiError.notFound("Job stage not found.");
  const counts = await countsByStage(executor, scope);
  return toSummary(stage, counts.get(stage.id) ?? 0);
}

function assertNameAvailable(
  active: readonly JobStage[],
  name: string,
  exceptStageId?: string,
): void {
  const key = name.toLowerCase();
  const clash = active.find(
    (stage) =>
      stage.id !== exceptStageId &&
      normalizeStageName(stage.name).toLowerCase() === key,
  );
  if (clash) {
    throw ApiError.conflict(
      `An active stage named "${clash.name}" already exists on this job. Stage names must be unique.`,
    );
  }
}

function describeShapeIssue(issue: PipelineShapeIssue): string {
  switch (issue.code) {
    case "no_active_stage":
      return "A pipeline needs at least one active stage that is not hired, rejected or withdrawn, so new applicants have somewhere to enter.";
    case "duplicate_name":
      return `Stage name "${issue.name}" is used more than once. Stage names must be unique.`;
    case "empty_name":
      return "Stage names cannot be empty.";
  }
}

/** Throws 409 when the given active stage list would break a pipeline invariant. */
function assertPipelineShape(
  stages: readonly (Pick<JobStage, "name" | "kind" | "archivedAt">)[],
): void {
  const [issue] = validatePipelineShape(stages);
  if (issue) throw ApiError.conflict(describeShapeIssue(issue));
}

/**
 * Rewrite the `order` of the job's active stages so that `orderedIds` becomes
 * 0..n-1. The partial unique index on (job_id, order) would reject a direct
 * swap, so changed rows first move to a temporary range and then to their
 * final values. Rows already at their target keep their value.
 */
async function writeActiveOrder(
  tx: Tx,
  scope: JobScope,
  orderedIds: readonly string[],
): Promise<void> {
  const current = await tx
    .select({ id: jobStages.id, order: jobStages.order })
    .from(jobStages)
    .where(
      and(
        eq(jobStages.workspaceId, scope.workspaceId),
        eq(jobStages.jobId, scope.jobId),
        isNull(jobStages.archivedAt),
      ),
    );
  const currentOrder = new Map(current.map((row) => [row.id, row.order]));
  const moves = orderedIds
    .map((id, index) => ({ id, index }))
    .filter(({ id, index }) => currentOrder.get(id) !== index);

  for (const { id, index } of moves) {
    await tx
      .update(jobStages)
      .set({ order: TEMP_REORDER_BASE + index })
      .where(eq(jobStages.id, id));
  }
  for (const { id, index } of moves) {
    await tx.update(jobStages).set({ order: index }).where(eq(jobStages.id, id));
  }
}

async function recordJobActivity(
  tx: Tx,
  scope: ActorScope,
  type: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await tx.insert(activityEvents).values({
    workspaceId: scope.workspaceId,
    actorId: scope.actorUserId,
    entityType: "job",
    entityId: scope.jobId,
    type,
    metadata,
  });
}

function defaultInsertPosition(active: readonly JobStage[]): number {
  const firstTerminal = active.findIndex((stage) =>
    isTerminalStageKind(effectiveStageKind(stage)),
  );
  return firstTerminal === -1 ? active.length : firstTerminal;
}

function isForeignKeyViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const direct = (error as { code?: unknown }).code;
  const cause = (error as { cause?: { code?: unknown } }).cause?.code;
  return direct === "23503" || cause === "23503";
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const direct = (error as { code?: unknown }).code;
  const cause = (error as { cause?: { code?: unknown } }).cause?.code;
  return direct === "23505" || cause === "23505";
}

/** Stages listed for a job, active first in board order, then archived. */
export async function listJobStages(
  input: JobScope & { includeArchived?: boolean },
): Promise<JobStageSummary[]> {
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.id, input.jobId),
        eq(jobs.workspaceId, input.workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .limit(1);
  if (!job) throw ApiError.notFound("Job not found.");

  const stages = await loadStages(db, input);
  const counts = await countsByStage(db, input);
  const live = activeStages(stages);
  const archived = stages
    .filter((stage) => stage.archivedAt)
    .sort((a, b) => (a.archivedAt?.getTime() ?? 0) - (b.archivedAt?.getTime() ?? 0));
  const ordered = input.includeArchived ? [...live, ...archived] : live;
  return ordered.map((stage) => toSummary(stage, counts.get(stage.id) ?? 0));
}

/**
 * Add a stage. Without `position` it lands before the first terminal stage,
 * so new applicants can still enter the pipeline and outcomes stay last.
 */
export async function createStage(
  input: ActorScope & {
    name: string;
    color?: string | null;
    kind?: StageKind;
    position?: number;
  },
): Promise<JobStageSummary> {
  const name = normalizeStageName(input.name);
  if (!name) throw ApiError.badRequest("Stage name is required.");

  return db.transaction(async (tx) => {
    await lockJob(tx, input);
    const active = activeStages(await loadStages(tx, input));
    assertNameAvailable(active, name);

    const position = input.position ?? defaultInsertPosition(active);
    if (position > active.length) {
      throw ApiError.unprocessable(
        `Position must be between 0 and ${active.length} for this job.`,
      );
    }
    const kind = input.kind ?? "custom";

    let created: JobStage | undefined;
    try {
      [created] = await tx
        .insert(jobStages)
        .values({
          workspaceId: input.workspaceId,
          jobId: input.jobId,
          name,
          color: input.color ?? null,
          kind,
          order: TEMP_INSERT_ORDER,
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiError.conflict("A stage with this name already exists on this job.");
      }
      throw error;
    }
    if (!created) throw ApiError.internal("Stage could not be created.");

    const ordered = active.map((stage) => stage.id);
    ordered.splice(position, 0, created.id);
    await writeActiveOrder(tx, input, ordered);
    assertPipelineShape([...active, { ...created, kind }]);

    await recordJobActivity(tx, input, "job.stage_created", {
      stageId: created.id,
      name,
      kind,
      position,
    });
    return readSummary(tx, input, created.id);
  });
}

/**
 * Rename, recolor, change email settings or change kind.
 *
 * A kind change is refused when the stage holds applications and either the
 * old or the new kind is terminal: moving applications between outcomes must
 * go through a merge so each application keeps a stage of the right kind.
 */
export async function updateStage(
  input: ActorScope & { stageId: string; patch: StagePatch },
): Promise<JobStageSummary> {
  const { patch } = input;
  if (
    patch.name === undefined &&
    patch.color === undefined &&
    patch.kind === undefined &&
    patch.emailConfig === undefined
  ) {
    throw ApiError.badRequest("Provide at least one stage field to update.");
  }

  return db.transaction(async (tx) => {
    await lockJob(tx, input);
    const stages = await loadStages(tx, input);
    const stage = findStage(stages, input.stageId);
    if (stage.archivedAt) {
      throw ApiError.conflict("Archived stages cannot be edited.");
    }

    const active = activeStages(stages);
    const nextName =
      patch.name === undefined ? stage.name : normalizeStageName(patch.name);
    if (!nextName) throw ApiError.badRequest("Stage name is required.");
    if (patch.name !== undefined) {
      assertNameAvailable(active, nextName, stage.id);
    }

    const currentKind = effectiveStageKind(stage);
    const nextKind = patch.kind ?? currentKind;
    if (nextKind !== currentKind) {
      const applicationCount = await countApplicationsInStage(tx, input, stage.id);
      if (
        applicationCount > 0 &&
        (isTerminalStageKind(currentKind) || isTerminalStageKind(nextKind))
      ) {
        throw ApiError.conflict(
          `This stage holds ${applicationCount} application(s). Changing its kind would move them to or from an outcome, which needs a merge. Archive the stage with mergeIntoStageId pointing at a stage of the matching kind instead.`,
        );
      }
    }

    assertPipelineShape([
      ...active.filter((candidate) => candidate.id !== stage.id),
      { ...stage, name: nextName, kind: nextKind, archivedAt: null },
    ]);

    const changes: string[] = [];
    if (nextName !== stage.name) changes.push("name");
    if (patch.color !== undefined && patch.color !== stage.color) changes.push("color");
    if (nextKind !== currentKind) changes.push("kind");
    if (patch.emailConfig !== undefined) changes.push("emailConfig");

    await tx
      .update(jobStages)
      .set({
        name: nextName,
        // Always persist the kind: a NULL-kind row keeps its meaning through
        // a rename instead of depending on its name afterwards.
        kind: nextKind,
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.emailConfig !== undefined
          ? { emailConfig: patch.emailConfig }
          : {}),
      })
      .where(eq(jobStages.id, stage.id));

    if (changes.length > 0) {
      await recordJobActivity(tx, input, "job.stage_updated", {
        stageId: stage.id,
        changes,
        ...(nextKind !== currentKind
          ? { kind: { from: currentKind, to: nextKind } }
          : {}),
      });
    }
    return readSummary(tx, input, stage.id);
  });
}

/**
 * Set the order of the active stages. `orderedStageIds` must name every active
 * stage of the job exactly once.
 */
export async function reorderStages(
  input: ActorScope & { orderedStageIds: readonly string[] },
): Promise<JobStageSummary[]> {
  return db.transaction(async (tx) => {
    await lockJob(tx, input);
    const active = activeStages(await loadStages(tx, input));
    const requested = input.orderedStageIds;
    const activeIds = new Set(active.map((stage) => stage.id));
    const uniqueRequested = new Set(requested);
    if (
      requested.length !== active.length ||
      uniqueRequested.size !== requested.length ||
      requested.some((id) => !activeIds.has(id))
    ) {
      throw ApiError.badRequest(
        "orderedStageIds must list every active stage of the job exactly once.",
      );
    }

    await writeActiveOrder(tx, input, requested);
    assertPipelineShape(active);
    await recordJobActivity(tx, input, "job.stage_reordered", {
      stageIds: [...requested],
    });

    const counts = await countsByStage(tx, input);
    const reloaded = activeStages(await loadStages(tx, input));
    return reloaded.map((stage) => toSummary(stage, counts.get(stage.id) ?? 0));
  });
}

/**
 * Retire a stage while keeping its history. Applications in it must be merged
 * into an active stage with the same outcome: a non-terminal stage merges into
 * any non-terminal stage, a terminal stage only into a stage of the same
 * terminal kind, so no application's status changes.
 *
 * History rows keep pointing at the archived stage. No candidate emails and no
 * application status events are produced by a merge.
 */
export async function archiveStage(
  input: ActorScope & { stageId: string; mergeIntoStageId?: string | null },
): Promise<ArchiveStageResult> {
  return db.transaction(async (tx) => {
    await lockJob(tx, input);
    await lockStageRows(tx, input, [input.stageId, input.mergeIntoStageId]);
    const stages = await loadStages(tx, input);
    const stage = findStage(stages, input.stageId);
    if (stage.archivedAt) {
      throw ApiError.conflict("This stage is already archived.");
    }

    const active = activeStages(stages);
    const sourceKind = effectiveStageKind(stage);
    const applicationCount = await countApplicationsInStage(tx, input, stage.id);
    const targetId = input.mergeIntoStageId ?? null;

    if (applicationCount > 0 && !targetId) {
      throw ApiError.unprocessable(
        `This stage holds ${applicationCount} application(s). Provide mergeIntoStageId to move them to another stage before archiving.`,
      );
    }

    if (targetId) {
      if (targetId === stage.id) {
        throw ApiError.unprocessable("A stage cannot be merged into itself.");
      }
      const target = stages.find((candidate) => candidate.id === targetId);
      if (!target) throw ApiError.notFound("Merge target stage not found.");
      if (target.archivedAt) {
        throw ApiError.conflict("Merge target stage is archived.");
      }
      const targetKind = effectiveStageKind(target);
      const terminalMismatch = isTerminalStageKind(sourceKind)
        ? targetKind !== sourceKind
        : isTerminalStageKind(targetKind);
      if (terminalMismatch) {
        throw ApiError.conflict(
          isTerminalStageKind(sourceKind)
            ? `Applications in a ${sourceKind} stage can only be merged into another ${sourceKind} stage, so their outcome does not change. "${target.name}" is ${targetKind}.`
            : `Applications in an active stage can only be merged into another active stage. "${target.name}" is ${targetKind}.`,
        );
      }
    }

    assertPipelineShape(active.filter((candidate) => candidate.id !== stage.id));

    if (applicationCount > 0 && targetId) {
      await tx.execute(sql`
        insert into application_stage_history
          (id, workspace_id, application_id, from_stage_id, to_stage_id, moved_by_id, created_at, updated_at)
        select gen_random_uuid(), a.workspace_id, a.id, ${stage.id}::uuid, ${targetId}::uuid, ${input.actorUserId}, now(), now()
        from applications a
        where a.workspace_id = ${input.workspaceId}
          and a.job_id = ${input.jobId}
          and a.current_stage_id = ${stage.id}::uuid
      `);

      const [tail] = await tx
        .select({ last: max(applications.pipelineOrder) })
        .from(applications)
        .where(
          and(
            eq(applications.workspaceId, input.workspaceId),
            eq(applications.jobId, input.jobId),
            eq(applications.currentStageId, targetId),
          ),
        );
      const base = (tail?.last ?? -1) + 1;

      await tx.execute(sql`
        update applications as a
        set current_stage_id = ${targetId}::uuid,
            pipeline_order = ${base}::int + ranked.position,
            updated_at = now()
        from (
          select id, (row_number() over (order by pipeline_order asc, applied_at asc, id asc) - 1)::int as position
          from applications
          where workspace_id = ${input.workspaceId}
            and job_id = ${input.jobId}
            and current_stage_id = ${stage.id}::uuid
        ) as ranked
        where a.id = ranked.id
      `);

      await recordJobActivity(tx, input, "stage.changed", {
        source: "stage_merge",
        stageId: stage.id,
        fromStageId: stage.id,
        toStageId: targetId,
        applicationCount,
      });
    }

    await tx
      .update(jobStages)
      .set({ archivedAt: new Date() })
      .where(eq(jobStages.id, stage.id));

    await recordJobActivity(tx, input, "job.stage_archived", {
      stageId: stage.id,
      name: stage.name,
      mergedIntoStageId: targetId,
      movedApplications: applicationCount,
    });

    return {
      stage: await readSummary(tx, input, stage.id),
      movedApplications: applicationCount,
    };
  });
}

/**
 * Automations store stage ids in their graphs (move_stage actions and
 * conditions). Count every stored definition, version and draft that mentions
 * the id, so a hard delete never silently breaks an automation.
 */
async function countAutomationReferences(
  tx: Tx,
  scope: JobScope,
  stageId: string,
): Promise<number> {
  const mentions = (column: unknown) =>
    sql`position(${stageId} in ${column}::text) > 0`;

  const [definitions] = await tx
    .select({ total: count() })
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.workspaceId, scope.workspaceId),
        or(
          mentions(workflowDefinitions.trigger),
          mentions(workflowDefinitions.conditions),
          mentions(workflowDefinitions.actions),
        ),
      ),
    );
  const [versions] = await tx
    .select({ total: count() })
    .from(workflowDefinitionVersions)
    .where(
      and(
        eq(workflowDefinitionVersions.workspaceId, scope.workspaceId),
        or(
          mentions(workflowDefinitionVersions.trigger),
          mentions(workflowDefinitionVersions.conditions),
          mentions(workflowDefinitionVersions.actions),
        ),
      ),
    );
  const [drafts] = await tx
    .select({ total: count() })
    .from(workflowDrafts)
    .where(
      and(
        eq(workflowDrafts.workspaceId, scope.workspaceId),
        mentions(workflowDrafts.graph),
      ),
    );
  return (
    Number(definitions?.total ?? 0) +
    Number(versions?.total ?? 0) +
    Number(drafts?.total ?? 0)
  );
}

/**
 * Hard-delete a stage that has never held an application. Any use at all
 * (applications, stage history, scorecards, document requirements, automations)
 * refuses the delete, so the caller archives the stage instead and history is
 * kept.
 */
export async function deleteStage(
  input: ActorScope & { stageId: string },
): Promise<void> {
  return db.transaction(async (tx) => {
    await lockJob(tx, input);
    const stages = await loadStages(tx, input);
    const stage = findStage(stages, input.stageId);

    const applicationCount = await countApplicationsInStage(tx, input, stage.id);
    if (applicationCount > 0) {
      throw ApiError.conflict(
        `This stage holds ${applicationCount} application(s). Move them elsewhere or archive the stage instead.`,
      );
    }

    const [history] = await tx
      .select({ total: count() })
      .from(applicationStageHistory)
      .where(
        and(
          eq(applicationStageHistory.workspaceId, input.workspaceId),
          or(
            eq(applicationStageHistory.fromStageId, stage.id),
            eq(applicationStageHistory.toStageId, stage.id),
          ),
        ),
      );
    if (Number(history?.total ?? 0) > 0) {
      throw ApiError.conflict(
        "This stage appears in application history. Archive it instead so history is kept.",
      );
    }

    const [scored] = await tx
      .select({ total: count() })
      .from(scorecards)
      .where(
        and(
          eq(scorecards.workspaceId, input.workspaceId),
          eq(scorecards.stageId, stage.id),
        ),
      );
    if (Number(scored?.total ?? 0) > 0) {
      throw ApiError.conflict(
        "Scorecards were recorded at this stage. Archive it instead so they keep their stage.",
      );
    }

    const [required] = await tx
      .select({ total: count() })
      .from(documentRequirements)
      .where(
        and(
          eq(documentRequirements.workspaceId, input.workspaceId),
          eq(documentRequirements.stageId, stage.id),
        ),
      );
    if (Number(required?.total ?? 0) > 0) {
      throw ApiError.conflict(
        "Document requirements are attached to this stage. Archive it instead, or move the requirements first.",
      );
    }

    const automationReferences = await countAutomationReferences(tx, input, stage.id);
    if (automationReferences > 0) {
      throw ApiError.conflict(
        "Automations reference this stage. Update those automations first, or archive the stage instead.",
      );
    }

    // Removing an active stage must not leave the pipeline without an entry stage.
    if (!stage.archivedAt) {
      assertPipelineShape(
        activeStages(stages).filter((candidate) => candidate.id !== stage.id),
      );
    }

    try {
      await tx
        .delete(jobStages)
        .where(
          and(
            eq(jobStages.id, stage.id),
            eq(jobStages.workspaceId, input.workspaceId),
            eq(jobStages.jobId, input.jobId),
          ),
        );
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw ApiError.conflict(
          "This stage is still referenced. Archive it instead.",
        );
      }
      throw error;
    }

    await recordJobActivity(tx, input, "job.stage_deleted", {
      stageId: stage.id,
      name: stage.name,
      kind: effectiveStageKind(stage),
    });
  });
}
