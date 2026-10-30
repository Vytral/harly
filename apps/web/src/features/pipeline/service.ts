import "server-only";

import { ApiError } from "@harly/api";
import { effectiveStageKind, type JobStage, type StageKind } from "@harly/db";

import { resolveWorkspaceActorUserId } from "@/server/api/actor";

import {
  archiveStage,
  createStage,
  deleteStage,
  listJobStages,
  parseStageEmailConfig,
  reorderStages,
  updateStage,
  type ArchiveStageResult,
  type JobStageSummary,
  type StageEmailConfig,
  type StagePatch,
} from "./stage-lifecycle";

export type JobStageApiInput = {
  name?: string;
  color?: string | null;
  kind?: StageKind;
  /** Already validated by the caller (see parseStageEmailConfig). */
  emailConfig?: StageEmailConfig;
};

type ApiActorScope = { workspaceId: string; jobId: string; actorUserId: string };

/**
 * API-key writes are attributed to the key's creator while they are still a
 * member of the workspace, otherwise to an owner (same rule as job writes).
 */
export async function resolveStageActorUserId(auth: {
  workspaceId: string;
  createdById: string | null;
}): Promise<string> {
  const actorUserId = await resolveWorkspaceActorUserId(
    auth.workspaceId,
    auth.createdById,
  );
  if (!actorUserId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }
  return actorUserId;
}

function normalizeEmailConfig(value: unknown): StageEmailConfig {
  return parseStageEmailConfig(value) ?? { candidateUpdatesEnabled: true };
}

/**
 * Public API shape. Keep workspace IDs and DB-only fields private. `kind` is
 * the effective kind (NULL-kind legacy rows are classified by name) so API
 * consumers never see an unclassified stage.
 */
export function serializeJobStage(stage: JobStage) {
  return {
    id: stage.id,
    jobId: stage.jobId,
    name: stage.name,
    color: stage.color,
    order: stage.order,
    kind: effectiveStageKind(stage),
    archivedAt: stage.archivedAt ? stage.archivedAt.toISOString() : null,
    emailConfig: normalizeEmailConfig(stage.emailConfig),
    createdAt: stage.createdAt.toISOString(),
    updatedAt: stage.updatedAt.toISOString(),
  };
}

/** Stages for API consumers. Archived stages are included only on request. */
export async function listJobStagesForApi(input: {
  workspaceId: string;
  jobId: string;
  includeArchived?: boolean;
}): Promise<JobStageSummary[]> {
  return listJobStages(input);
}

export async function createJobStageForApi(
  input: ApiActorScope & {
    name: string;
    color?: string | null;
    kind?: StageKind;
    position?: number;
  },
): Promise<JobStageSummary> {
  return createStage(input);
}

/** Update one stage only when it belongs to both workspace and job. */
export async function updateJobStageForApi(
  input: ApiActorScope & { stageId: string; patch: JobStageApiInput },
): Promise<JobStageSummary> {
  const patch: StagePatch = {
    name: input.patch.name,
    color: input.patch.color,
    kind: input.patch.kind,
    emailConfig: input.patch.emailConfig,
  };
  return updateStage({
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    actorUserId: input.actorUserId,
    stageId: input.stageId,
    patch,
  });
}

export async function reorderJobStagesForApi(
  input: ApiActorScope & { stageIds: readonly string[] },
): Promise<JobStageSummary[]> {
  return reorderStages({ ...input, orderedStageIds: input.stageIds });
}

export async function archiveJobStageForApi(
  input: ApiActorScope & { stageId: string; mergeIntoStageId?: string | null },
): Promise<ArchiveStageResult> {
  return archiveStage(input);
}

export async function deleteJobStageForApi(
  input: ApiActorScope & { stageId: string },
): Promise<void> {
  return deleteStage(input);
}
