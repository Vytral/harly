import { serializeJob, setJobStatusForApi } from "@/features/jobs/service";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/v1/jobs/{id}/close , close the job. */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "jobs:write");
  const { id } = await (context as Context).params;
  const job = await setJobStatusForApi({
    workspaceId: ctx.workspaceId,
    jobId: id,
    status: "closed",
  });
  return apiOk(serializeJob(job));
});
