import {
  deleteJobStageForApi,
  resolveStageActorUserId,
  serializeJobStage,
  updateJobStageForApi,
} from "@/features/pipeline/service";
import { parseStageEmailConfig } from "@/features/pipeline/stage-lifecycle";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  deleteJobStageContract,
  updateJobStageContract,
} from "@/server/api/contracts/jobs";
import { withApi, apiOk } from "@/server/api/respond";
import { jobStageUpdateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export const PATCH = withApi(
  buildRouteHandler(
    updateJobStageContract,
    async ({ params, body, auth }) => {
      const values = jobStageUpdateSchema.parse(body);
      const actorUserId = await resolveStageActorUserId(auth);
      const stage = await updateJobStageForApi({
        workspaceId: auth.workspaceId,
        jobId: params.id,
        actorUserId,
        stageId: params.stageId,
        patch: {
          name: values.name,
          color: values.color,
          kind: values.kind,
          emailConfig: parseStageEmailConfig(values.emailConfig),
        },
      });
      return apiOk(serializeJobStage(stage));
    },
  ),
);

export const DELETE = withApi(
  buildRouteHandler(deleteJobStageContract, async ({ params, auth }) => {
    const actorUserId = await resolveStageActorUserId(auth);
    await deleteJobStageForApi({
      workspaceId: auth.workspaceId,
      jobId: params.id,
      actorUserId,
      stageId: params.stageId,
    });
    return apiOk({ success: true });
  }),
);
