import {
  hireApplicationForApi,
  serializeApplication,
} from "@/features/applications/service";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/v1/applications/{id}/hire — mark hired (fires application.hired). */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "applications:write");
  const { id } = await (context as Context).params;
  const application = await hireApplicationForApi({
    workspaceId: ctx.workspaceId,
    applicationId: id,
  });
  return apiOk(serializeApplication(application));
});
