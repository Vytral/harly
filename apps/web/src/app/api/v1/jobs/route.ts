import {
  ApiError,
  decodeCursor,
  paginate,
  parseLimit,
} from "@harly/api";

import {
  createJobForApi,
  listJobsForApi,
  serializeJob,
} from "@/features/jobs/service";
import type { JobStatus } from "@/features/jobs/validation";
import { authenticateApiKey } from "@/server/api/auth";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { jobCreateSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

/** GET /api/v1/jobs — list jobs (cursor-paginated). */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "jobs:read");
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const status = url.searchParams.get("status") as JobStatus | null;

  const rows = await listJobsForApi({
    workspaceId: ctx.workspaceId,
    status: status ?? undefined,
    cursor,
    limit,
  });
  const { items, meta } = paginate(rows, limit, (job) => ({
    createdAt: job.createdAt.toISOString(),
    id: job.id,
  }));

  return apiOk(items.map(serializeJob), { pagination: meta });
});

/** POST /api/v1/jobs — create a job. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "jobs:write");
  const body = await request.json().catch(() => null);
  const values = jobCreateSchema.parse(body);

  const actorUserId = await resolveWorkspaceActorUserId(ctx.workspaceId);
  if (!actorUserId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }

  const job = await createJobForApi({
    workspaceId: ctx.workspaceId,
    actorUserId,
    values,
  });
  return apiOk(serializeJob(job), { status: 201 });
});
