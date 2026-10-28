import {
  reorderJobStagesForApi,
  resolveStageActorUserId,
  serializeJobStage,
} from "@/features/pipeline/service";
import { buildRouteHandler } from "@/server/api/contracts";
import { reorderJobStagesContract } from "@/server/api/contracts/jobs";
import { withApi, apiOk } from "@/server/api/respond";
import { jobStageReorderSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export const POST = withApi(
  buildRouteHandler(
    reorderJobStagesContract,
    async ({ params, body, auth }) => {
      const values = jobStageReorderSchema.parse(body);
      const actorUserId = await resolveStageActorUserId(auth);
      const stages = await reorderJobStagesForApi({
        workspaceId: auth.workspaceId,
        jobId: params.id,
        actorUserId,
        stageIds: values.stageIds,
      });
      return apiOk(stages.map(serializeJobStage));
    },
  ),
);
