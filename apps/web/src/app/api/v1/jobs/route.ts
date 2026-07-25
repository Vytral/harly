import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";
import { NextResponse } from "next/server";

import {
  createJobForApi,
  listJobsForApi,
  serializeJob,
} from "@/features/jobs/service";
import type { JobStatus } from "@/features/jobs/validation";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createJobContract,
  listJobsContract,
} from "@/server/api/contracts/jobs";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { jobCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(listJobsContract, async ({ query, auth }) => {
    const q = query as { limit?: number; cursor?: string; status?: JobStatus };
    const status = q.status as JobStatus | undefined;
    const rows = await listJobsForApi({
      workspaceId: auth.workspaceId,
      status,
      cursor: decodeCursor(q.cursor ?? null),
      limit: q.limit ?? parseLimit(null),
    });
    const { items, meta } = paginate(
      rows,
      q.limit ?? parseLimit(null),
      (job) => ({
        createdAt: job.createdAt.toISOString(),
        id: job.id,
      }),
    );
    return apiOk(items.map(serializeJob), { pagination: meta });
  }),
);

export const POST = withApi(
  buildRouteHandler(createJobContract, async ({ body, auth, request }) => {
    const values = jobCreateSchema.parse(body);
    const idempotency = await reserveIdempotencyKey(request, auth, {
      path: createJobContract.path,
    });
    if (idempotency.kind === "replay") {
      return NextResponse.json(idempotency.response.body, {
        status: idempotency.response.status,
      });
    }
    const actorUserId = await resolveWorkspaceActorUserId(
      auth.workspaceId,
      auth.createdById,
    );
    if (!actorUserId) {
      throw ApiError.unprocessable(
        "Workspace has no owner to attribute this to.",
      );
    }
    const job = await createJobForApi({
      workspaceId: auth.workspaceId,
      actorUserId,
      values,
    });
    const response = apiOk(serializeJob(job), { status: 201 });
    if (idempotency.kind === "reserved") {
      await idempotency.complete({
        status: response.status,
        body: await response.clone().json(),
      });
    }
    return response;
  }),
);
