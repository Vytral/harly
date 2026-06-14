import { serializeJob, setJobStatusForApi } from "@/features/jobs/service";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/v1/jobs/{id}/publish — open the job (fires job.published). */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "jobs:write");
  const { id } = await (context as Context).params;
  const job = await setJobStatusForApi({
    workspaceId: ctx.workspaceId,
    jobId: id,
    status: "open",
  });
  return apiOk(serializeJob(job));
});
