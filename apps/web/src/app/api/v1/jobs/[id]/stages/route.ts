import {
  listJobStagesForApi,
  serializeJobStage,
} from "@/features/pipeline/service";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** GET /api/v1/jobs/{id}/stages , list the job's ordered pipeline. */
export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "stages:read");
  const { id } = await (context as Context).params;
  const stages = await listJobStagesForApi({
    workspaceId: ctx.workspaceId,
    jobId: id,
  });
  return apiOk(stages.map(serializeJobStage));
});
