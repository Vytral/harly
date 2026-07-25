import { serializeJob, setJobStatusForApi } from "@/features/jobs/service";
import { buildRouteHandler } from "@/server/api/contracts";
import { publishJobContract } from "@/server/api/contracts/jobs";
import { withApi, apiOk } from "@/server/api/respond";

export const runtime = "nodejs";

export const POST = withApi(
  buildRouteHandler(publishJobContract, async ({ params, auth }) => {
    const response = await setJobStatusForApi({
      workspaceId: auth.workspaceId,
      jobId: params.id,
      status: "open",
    }).then((job) => apiOk(serializeJob(job)));
    return response;
  }),
);
