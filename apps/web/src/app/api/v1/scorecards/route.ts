import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";
import { NextResponse } from "next/server";

import {
  createScorecardForApi,
  listScorecardsForApi,
  serializeScorecard,
} from "@/features/scorecards/service";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { scorecardCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

function actorUserId(createdById: string | null): string {
  if (!createdById) {
    throw ApiError.conflict(
      "This API key has no active creator and cannot perform attributed writes.",
    );
  }
  return createdById;
}

/** GET /api/v1/scorecards , cursor-paginated scorecards. */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "scorecards:read");
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const rows = await listScorecardsForApi({
    workspaceId: ctx.workspaceId,
    candidateId: url.searchParams.get("candidateId") ?? undefined,
    applicationId: url.searchParams.get("applicationId") ?? undefined,
    cursor,
    limit,
  });
  const { items, meta } = paginate(rows, limit, (scorecard) => ({
    createdAt: scorecard.createdAt.toISOString(),
    id: scorecard.id,
  }));
  return apiOk(items.map(serializeScorecard), { pagination: meta });
});

/** POST /api/v1/scorecards , add an attributed team evaluation. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "scorecards:write");
  // Parse clone first; the reservation hashes the original request body.
  const values = scorecardCreateSchema.parse(
    await request.clone().json().catch(() => null),
  );
  const reservation = await reserveIdempotencyKey(request, ctx);
  if (reservation.kind === "replay") {
    return NextResponse.json(reservation.response.body, {
      status: reservation.response.status,
    });
  }
  const scorecard = await createScorecardForApi({
    workspaceId: ctx.workspaceId,
    actorUserId: actorUserId(ctx.createdById),
    values,
  });
  const response = apiOk(serializeScorecard(scorecard), { status: 201 });
  if (reservation.kind === "reserved") {
    await reservation.complete({
      status: response.status,
      body: await response.clone().json(),
    });
  }
  return response;
});
