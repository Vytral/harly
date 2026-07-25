import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";
import { NextResponse } from "next/server";

import {
  createScorecardForApi,
  listScorecardsForApi,
  serializeScorecard,
} from "@/features/scorecards/service";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createScorecardContract,
  listScorecardsContract,
} from "@/server/api/contracts/scorecards";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
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

export const GET = withApi(
  buildRouteHandler(listScorecardsContract, async ({ query, auth }) => {
    const q = query as {
      limit?: number;
      cursor?: string;
      candidateId?: string;
      applicationId?: string;
    };
    const limit = q.limit ?? parseLimit(null);
    const rows = await listScorecardsForApi({
      workspaceId: auth.workspaceId,
      candidateId: q.candidateId,
      applicationId: q.applicationId,
      cursor: decodeCursor(q.cursor ?? null),
      limit,
    });
    const { items, meta } = paginate(rows, limit, (scorecard) => ({
      createdAt: scorecard.createdAt.toISOString(),
      id: scorecard.id,
    }));
    return apiOk(items.map(serializeScorecard), { pagination: meta });
  }),
);

export const POST = withApi(
  buildRouteHandler(
    createScorecardContract,
    async ({ body, auth, request }) => {
      const reservation = await reserveIdempotencyKey(request, auth);
      if (reservation.kind === "replay") {
        return NextResponse.json(reservation.response.body, {
          status: reservation.response.status,
        });
      }
      const scorecard = await createScorecardForApi({
        workspaceId: auth.workspaceId,
        actorUserId: actorUserId(auth.createdById),
        values: body as never,
      });
      const bodyJson = serializeScorecard(scorecard);
      const response = apiOk(bodyJson, { status: 201 });
      if (reservation.kind === "reserved") {
        await reservation.complete({ status: response.status, body: bodyJson });
      }
      return response;
    },
  ),
);
