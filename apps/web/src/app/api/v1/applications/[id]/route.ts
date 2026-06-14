import {
  getApplicationForApi,
  serializeApplication,
} from "@/features/applications/service";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "applications:read");
  const { id } = await (context as Context).params;
  const application = await getApplicationForApi({
    workspaceId: ctx.workspaceId,
    applicationId: id,
  });
  return apiOk(serializeApplication(application));
});
