import {
  deleteJobForApi,
  getJobForApi,
  serializeJob,
  updateJobForApi,
} from "@/features/jobs/service";
import { withApi, apiOk } from "@/server/api/respond";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  deleteJobContract,
  getJobContract,
  updateJobContract,
} from "@/server/api/contracts/jobs";
import { jobUpdateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(getJobContract, async ({ params, auth }) => {
    const job = await getJobForApi({
      workspaceId: auth.workspaceId,
      jobId: params.id,
    });
    return apiOk(serializeJob(job));
  }),
);

export const PATCH = withApi(
  buildRouteHandler(updateJobContract, async ({ params, body, auth }) => {
    const values = jobUpdateSchema.parse(body);
    const job = await updateJobForApi({
      workspaceId: auth.workspaceId,
      jobId: params.id,
      values,
    });
    return apiOk(serializeJob(job));
  }),
);

export const DELETE = withApi(
  buildRouteHandler(deleteJobContract, async ({ params, auth }) => {
    await deleteJobForApi({ workspaceId: auth.workspaceId, jobId: params.id });
    return apiOk({ success: true });
  }),
);
