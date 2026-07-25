import { serializeJob, setJobStatusForApi } from "@/features/jobs/service";
import { buildRouteHandler } from "@/server/api/contracts";
import { closeJobContract } from "@/server/api/contracts/jobs";
import { withApi, apiOk } from "@/server/api/respond";

export const runtime = "nodejs";

export const POST = withApi(
  buildRouteHandler(closeJobContract, async ({ params, auth }) => {
    const job = await setJobStatusForApi({
      workspaceId: auth.workspaceId,
      jobId: params.id,
      status: "closed",
    });
    return apiOk(serializeJob(job));
  }),
);
