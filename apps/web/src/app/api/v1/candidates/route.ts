import { decodeCursor, paginate, parseLimit } from "@harly/api";

import {
  createCandidateForApi,
  listCandidatesForApi,
  serializeCandidate,
} from "@/features/candidates/service";
import { authenticateApiKey } from "@/server/api/auth";
import { candidateCreateSchema } from "@/server/api/schemas";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** GET /api/v1/candidates , list candidates (cursor-paginated). */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "candidates:read");
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));

  const rows = await listCandidatesForApi({
    workspaceId: ctx.workspaceId,
    cursor,
    limit,
  });
  const { items, meta } = paginate(rows, limit, (candidate) => ({
    createdAt: candidate.createdAt.toISOString(),
    id: candidate.id,
  }));

  return apiOk(items.map(serializeCandidate), { pagination: meta });
});

/** POST /api/v1/candidates , create a candidate. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "candidates:write");
  const idempotency = await reserveIdempotencyKey(request, ctx);
  if (idempotency.kind === "replay") {
    return NextResponse.json(idempotency.response.body, {
      status: idempotency.response.status,
    });
  }
  const values = candidateCreateSchema.parse(
    await request.json().catch(() => null),
  );
  const candidate = await createCandidateForApi({
    workspaceId: ctx.workspaceId,
    values,
  });
  const response = apiOk(serializeCandidate(candidate), { status: 201 });
  if (idempotency.kind === "reserved") {
    await idempotency.complete({
      status: response.status,
      body: await response.clone().json(),
    });
  }
  return response;
});
