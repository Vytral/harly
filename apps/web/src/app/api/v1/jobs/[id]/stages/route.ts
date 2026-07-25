import {
  listJobStagesForApi,
  serializeJobStage,
} from "@/features/pipeline/service";
import { buildRouteHandler } from "@/server/api/contracts";
import { listJobStagesContract } from "@/server/api/contracts/jobs";
import { withApi, apiOk } from "@/server/api/respond";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(listJobStagesContract, async ({ params, auth }) => {
    const stages = await listJobStagesForApi({
      workspaceId: auth.workspaceId,
      jobId: params.id,
    });
    return apiOk(stages.map(serializeJobStage));
  }),
);
