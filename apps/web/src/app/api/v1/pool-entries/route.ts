import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";

import {
  addPoolEntryForApi,
  listPoolEntriesForApi,
  serializePoolEntry,
  type PoolEntryApiInput,
  type PoolEntrySource,
} from "@/features/pool/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { poolEntryCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

function poolEntryValuesForService(
  values: ReturnType<typeof poolEntryCreateSchema.parse>,
): PoolEntryApiInput {
  return values;
}

/** GET /api/v1/pool-entries , cursor-paginated active talent-pool entries. */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "pool:read");
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const rows = await listPoolEntriesForApi({
    workspaceId: ctx.workspaceId,
    cursor,
    limit,
    candidateId: url.searchParams.get("candidateId") ?? undefined,
    jobId: url.searchParams.get("jobId") ?? undefined,
    source:
      (url.searchParams.get("source") as PoolEntrySource | null) ?? undefined,
  });
  const { items, meta } = paginate(rows, limit, (entry) => ({
    createdAt: entry.createdAt.toISOString(),
    id: entry.id,
  }));

  return apiOk(items.map(serializePoolEntry), { pagination: meta });
});

/** POST /api/v1/pool-entries , add or restore a talent-pool entry. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "pool:write");
  const idempotency = await reserveIdempotencyKey(request, {
    workspaceId: ctx.workspaceId,
    keyId: ctx.keyId,
  });
  if (idempotency.kind === "replay") {
    return apiOk(idempotency.response.body, {
      status: idempotency.response.status,
    });
  }

  const values = poolEntryValuesForService(
    poolEntryCreateSchema.parse(await request.json().catch(() => null)),
  );
  const actorId = await resolveWorkspaceActorUserId(
    ctx.workspaceId,
    ctx.createdById,
  );
  if (!actorId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }
  const entry = await addPoolEntryForApi({
    workspaceId: ctx.workspaceId,
    actorId,
    values,
  });
  const body = serializePoolEntry(entry);
  if (idempotency.kind === "reserved") {
    await idempotency.complete({ status: 201, body });
  }
  return apiOk(body, { status: 201 });
});
