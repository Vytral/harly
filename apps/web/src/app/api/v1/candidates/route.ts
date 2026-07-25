import { decodeCursor, paginate, parseLimit } from "@harly/api";
import { NextResponse } from "next/server";

import {
  createCandidateForApi,
  listCandidatesForApi,
  serializeCandidate,
} from "@/features/candidates/service";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createCandidateContract,
  listCandidatesContract,
} from "@/server/api/contracts/candidates";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { candidateCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(listCandidatesContract, async ({ query, auth }) => {
    const q = query as { limit?: number; cursor?: string };
    const limit = q.limit ?? parseLimit(null);
    const rows = await listCandidatesForApi({
      workspaceId: auth.workspaceId,
      cursor: decodeCursor(q.cursor ?? null),
      limit,
    });
    const { items, meta } = paginate(rows, limit, (candidate) => ({
      createdAt: candidate.createdAt.toISOString(),
      id: candidate.id,
    }));
    return apiOk(items.map(serializeCandidate), { pagination: meta });
  }),
);

export const POST = withApi(
  buildRouteHandler(
    createCandidateContract,
    async ({ body, auth, request }) => {
      const values = candidateCreateSchema.parse(body);
      const reservation = await reserveIdempotencyKey(request, auth, {
        path: createCandidateContract.path,
      });
      if (reservation.kind === "replay") {
        return NextResponse.json(reservation.response.body, {
          status: reservation.response.status,
        });
      }
      const candidate = await createCandidateForApi({
        workspaceId: auth.workspaceId,
        values,
      });
      const response = apiOk(serializeCandidate(candidate), { status: 201 });
      if (reservation.kind === "reserved") {
        await reservation.complete({
          status: response.status,
          body: await response.clone().json(),
        });
      }
      return response;
    },
  ),
);
