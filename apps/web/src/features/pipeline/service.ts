import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { ApiError } from "@harly/api";
import { db, jobStages, type JobStage } from "@harly/db";

export type StageEmailConfig = {
  candidateUpdatesEnabled: boolean;
};

export type JobStageApiInput = {
  name?: string;
  color?: string | null;
  emailConfig?: StageEmailConfig;
};

function normalizeEmailConfig(value: unknown): StageEmailConfig {
  if (
    typeof value === "object" &&
    value !== null &&
    "candidateUpdatesEnabled" in value &&
    typeof value.candidateUpdatesEnabled === "boolean"
  ) {
    return { candidateUpdatesEnabled: value.candidateUpdatesEnabled };
  }

  return { candidateUpdatesEnabled: true };
}

/** Public API shape. Keep workspace IDs and DB-only fields private. */
export function serializeJobStage(stage: JobStage) {
  return {
    id: stage.id,
    jobId: stage.jobId,
    name: stage.name,
    color: stage.color,
    order: stage.order,
    emailConfig: normalizeEmailConfig(stage.emailConfig),
    createdAt: stage.createdAt.toISOString(),
    updatedAt: stage.updatedAt.toISOString(),
  };
}

/** List one job's pipeline stages, ordered for API consumers. */
export async function listJobStagesForApi(input: {
  workspaceId: string;
  jobId: string;
}): Promise<JobStage[]> {
  return db
    .select()
    .from(jobStages)
    .where(
      and(
        eq(jobStages.workspaceId, input.workspaceId),
        eq(jobStages.jobId, input.jobId),
      ),
    )
    .orderBy(asc(jobStages.order));
}

/** Update one stage only when it belongs to both workspace and job. */
export async function updateJobStageForApi(input: {
  workspaceId: string;
  jobId: string;
  stageId: string;
  patch: JobStageApiInput;
}): Promise<JobStage> {
  if (
    input.patch.name === undefined &&
    input.patch.color === undefined &&
    input.patch.emailConfig === undefined
  ) {
    throw ApiError.badRequest("Provide at least one stage field to update.");
  }

  const [stage] = await db
    .update(jobStages)
    .set({
      ...(input.patch.name !== undefined ? { name: input.patch.name } : {}),
      ...(input.patch.color !== undefined ? { color: input.patch.color } : {}),
      ...(input.patch.emailConfig !== undefined
        ? { emailConfig: input.patch.emailConfig }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobStages.id, input.stageId),
        eq(jobStages.workspaceId, input.workspaceId),
        eq(jobStages.jobId, input.jobId),
      ),
    )
    .returning();

  if (!stage) throw ApiError.notFound("Job stage not found.");
  return stage;
}
