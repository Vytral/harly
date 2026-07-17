import {
  moveApplicationStageForApi,
  serializeApplication,
} from "@/features/applications/service";
import { authenticateApiKey } from "@/server/api/auth";
import { applicationMoveSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/v1/applications/{id}/move , move to a pipeline stage. */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "applications:write");
  const { id } = await (context as Context).params;
  const { toStageId } = applicationMoveSchema.parse(
    await request.json().catch(() => null),
  );
  const application = await moveApplicationStageForApi({
    workspaceId: ctx.workspaceId,
    applicationId: id,
    toStageId,
  });
  return apiOk(serializeApplication(application));
});
