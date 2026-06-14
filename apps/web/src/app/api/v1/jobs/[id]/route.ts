import {
  deleteJobForApi,
  getJobForApi,
  serializeJob,
  updateJobForApi,
} from "@/features/jobs/service";
import { authenticateApiKey } from "@/server/api/auth";
import { jobUpdateSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "jobs:read");
  const { id } = await (context as Context).params;
  const job = await getJobForApi({ workspaceId: ctx.workspaceId, jobId: id });
  return apiOk(serializeJob(job));
});

export const PATCH = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "jobs:write");
  const { id } = await (context as Context).params;
  const values = jobUpdateSchema.parse(await request.json().catch(() => null));
  const job = await updateJobForApi({
    workspaceId: ctx.workspaceId,
    jobId: id,
    values,
  });
  return apiOk(serializeJob(job));
});

export const DELETE = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "jobs:write");
  const { id } = await (context as Context).params;
  await deleteJobForApi({ workspaceId: ctx.workspaceId, jobId: id });
  return apiOk({ deleted: true });
});
