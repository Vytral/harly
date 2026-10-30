import {
  archiveJobStageForApi,
  resolveStageActorUserId,
  serializeJobStage,
} from "@/features/pipeline/service";
import { buildRouteHandler } from "@/server/api/contracts";
import { archiveJobStageContract } from "@/server/api/contracts/jobs";
import { withApi, apiOk } from "@/server/api/respond";

export const runtime = "nodejs";

export const POST = withApi(
  buildRouteHandler(
    archiveJobStageContract,
    async ({ params, body, auth }) => {
      // Already validated by the contract; a missing body arrives as null.
      const parsed = body as { mergeIntoStageId?: string | null } | null | undefined;
      const actorUserId = await resolveStageActorUserId(auth);
      const result = await archiveJobStageForApi({
        workspaceId: auth.workspaceId,
        jobId: params.id,
        actorUserId,
        stageId: params.stageId,
        mergeIntoStageId: parsed?.mergeIntoStageId ?? null,
      });
      return apiOk({
        stage: serializeJobStage(result.stage),
        movedApplications: result.movedApplications,
      });
    },
  ),
);
