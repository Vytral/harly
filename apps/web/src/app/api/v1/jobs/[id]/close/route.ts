import { serializeJob, setJobStatusForApi } from "@/features/jobs/service";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/v1/jobs/{id}/close , close the job. */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "jobs:write");
  const idempotency = await reserveIdempotencyKey(request, ctx);
  if (idempotency.kind === "replay") {
    return NextResponse.json(idempotency.response.body, { status: idempotency.response.status });
  }
  const { id } = await (context as Context).params;
  const job = await setJobStatusForApi({
    workspaceId: ctx.workspaceId,
    jobId: id,
    status: "closed",
  });
  const response = apiOk(serializeJob(job));
  if (idempotency.kind === "reserved") {
    await idempotency.complete({ status: response.status, body: await response.clone().json() });
  }
  return response;
});
