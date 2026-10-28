import {
  createJobStageForApi,
  listJobStagesForApi,
  resolveStageActorUserId,
  serializeJobStage,
} from "@/features/pipeline/service";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createJobStageContract,
  listJobStagesContract,
} from "@/server/api/contracts/jobs";
import { withApi, apiOk } from "@/server/api/respond";
import { jobStageCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(listJobStagesContract, async ({ params, query, auth }) => {
    const q = query as { includeArchived?: "true" | "false" };
    const stages = await listJobStagesForApi({
      workspaceId: auth.workspaceId,
      jobId: params.id,
      includeArchived: q.includeArchived === "true",
    });
    return apiOk(stages.map(serializeJobStage));
  }),
);

export const POST = withApi(
  buildRouteHandler(createJobStageContract, async ({ params, body, auth }) => {
    const values = jobStageCreateSchema.parse(body);
    const actorUserId = await resolveStageActorUserId(auth);
    const stage = await createJobStageForApi({
      workspaceId: auth.workspaceId,
      jobId: params.id,
      actorUserId,
      name: values.name,
      color: values.color,
      kind: values.kind,
      position: values.position,
    });
    return apiOk(serializeJobStage(stage), { status: 201 });
  }),
);
