import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";
import type { Interview } from "@harly/db";
import { NextResponse } from "next/server";

import {
  INTERVIEW_STATUSES,
  createInterviewForApi,
  listInterviewsForApi,
  serializeInterview,
} from "@/features/interviews/service";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { interviewCreateSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

function actorUserId(createdById: string | null): string {
  if (!createdById) {
    throw ApiError.conflict(
      "This API key has no active creator and cannot perform attributed writes.",
    );
  }
  return createdById;
}

/** GET /api/v1/interviews , cursor-paginated interview list. */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "interviews:read");
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (
    status !== null &&
    !INTERVIEW_STATUSES.includes(status as Interview["status"])
  ) {
    throw ApiError.badRequest("Invalid interview status.");
  }
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const rows = await listInterviewsForApi({
    workspaceId: ctx.workspaceId,
    candidateId: url.searchParams.get("candidateId") ?? undefined,
    applicationId: url.searchParams.get("applicationId") ?? undefined,
    jobId: url.searchParams.get("jobId") ?? undefined,
    interviewerId: url.searchParams.get("interviewerId") ?? undefined,
    status: status as Interview["status"] | undefined,
    cursor,
    limit,
  });
  const { items, meta } = paginate(rows, limit, (interview) => ({
    createdAt: interview.createdAt.toISOString(),
    id: interview.id,
  }));
  return apiOk(items.map(serializeInterview), { pagination: meta });
});

/** POST /api/v1/interviews , schedule an interview without provider side effects. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "interviews:write");
  // Parse a clone so `reserveIdempotencyKey` can hash the untouched request.
  const values = interviewCreateSchema.parse(
    await request.clone().json().catch(() => null),
  );
  const reservation = await reserveIdempotencyKey(request, ctx);
  if (reservation.kind === "replay") {
    return NextResponse.json(reservation.response.body, {
      status: reservation.response.status,
    });
  }

  const interview = await createInterviewForApi({
    workspaceId: ctx.workspaceId,
    actorUserId: actorUserId(ctx.createdById),
    values: {
      ...values,
      scheduledAt: new Date(values.scheduledAt),
    },
  });
  const response = apiOk(serializeInterview(interview), { status: 201 });
  if (reservation.kind === "reserved") {
    await reservation.complete({
      status: response.status,
      body: await response.clone().json(),
    });
  }
  return response;
});
