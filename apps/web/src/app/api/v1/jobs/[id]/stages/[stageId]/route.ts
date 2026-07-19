import { ApiError } from "@harly/api";

import {
  serializeJobStage,
  type StageEmailConfig,
  updateJobStageForApi,
} from "@/features/pipeline/service";
import { authenticateApiKey } from "@/server/api/auth";
import { jobStageUpdateSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; stageId: string }> };

function parseEmailConfig(value: unknown): StageEmailConfig | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value === "object" &&
    value !== null &&
    "candidateUpdatesEnabled" in value &&
    typeof value.candidateUpdatesEnabled === "boolean"
  ) {
    return { candidateUpdatesEnabled: value.candidateUpdatesEnabled };
  }
  throw ApiError.unprocessable(
    "emailConfig.candidateUpdatesEnabled must be a boolean.",
  );
}

/** PATCH /api/v1/jobs/{id}/stages/{stageId} , edit one scoped stage. */
export const PATCH = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "stages:write");
  const { id, stageId } = await (context as Context).params;
  const values = jobStageUpdateSchema.parse(
    await request.json().catch(() => null),
  );
  const stage = await updateJobStageForApi({
    workspaceId: ctx.workspaceId,
    jobId: id,
    stageId,
    patch: {
      name: values.name,
      color: values.color,
      emailConfig: parseEmailConfig(values.emailConfig),
    },
  });
  return apiOk(serializeJobStage(stage));
});
