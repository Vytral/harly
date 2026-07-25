import {
  getApplicationForApi,
  serializeApplication,
} from "@/features/applications/service";
import { buildRouteHandler } from "@/server/api/contracts";
import { getApplicationContract } from "@/server/api/contracts/applications";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(getApplicationContract, async ({ params, auth }) => {
    const application = await getApplicationForApi({
      workspaceId: auth.workspaceId,
      applicationId: params.id,
    });
    return apiOk(serializeApplication(application));
  }),
);
