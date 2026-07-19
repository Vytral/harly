import { ApiError } from "@harly/api";
import { NextResponse } from "next/server";

import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  serializeApiKey,
} from "@/features/developers/data";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { authenticateApiKey, type ApiKeyContext } from "@/server/api/auth";
import {
  reserveIdempotencyKey,
  type IdempotencyResult,
} from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function requireSecretKey(context: ApiKeyContext): void {
  if (context.type !== "secret") {
    throw ApiError.forbidden("API key management requires a secret API key.");
  }
}

function replayIdempotentResponse(
  result: IdempotencyResult,
): NextResponse | null {
  if (result.kind !== "replay") return null;
  return NextResponse.json(result.response.body, {
    status: result.response.status,
    headers: { "Idempotent-Replayed": "true" },
  });
}

/** POST /api/v1/api-keys/{id}/rotate , replace a key and return its raw value once. */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "api_keys:write");
  requireSecretKey(ctx);
  const { id } = await (context as Context).params;
  const idempotency = await reserveIdempotencyKey(request, {
    workspaceId: ctx.workspaceId,
    keyId: ctx.keyId,
  });
  const replay = replayIdempotentResponse(idempotency);
  if (replay) return replay;

  const existing = (await listApiKeys(ctx.workspaceId)).find(
    (key) => key.id === id,
  );
  if (!existing) throw ApiError.notFound("API key not found.");
  if (existing.revokedAt) {
    throw ApiError.conflict("A revoked API key cannot be rotated.");
  }

  const actorUserId = await resolveWorkspaceActorUserId(
    ctx.workspaceId,
    ctx.createdById,
  );

  // Insert first. Old key is revoked only after its replacement exists.
  const { key, raw } = await createApiKey({
    workspaceId: ctx.workspaceId,
    name: existing.name,
    type: existing.type as "publishable" | "secret",
    environment: existing.environment as "live" | "test",
    scopes: existing.scopes as string[],
    createdById: actorUserId,
    expiresAt: existing.expiresAt,
  });
  await revokeApiKey({ workspaceId: ctx.workspaceId, keyId: existing.id });

  const data = { replacedKeyId: existing.id, apiKey: serializeApiKey(key) };
  if (idempotency.kind === "reserved") {
    // Persist metadata only; never store a newly generated raw API key.
    await idempotency.complete({ status: 201, body: { data } });
  }
  return apiOk({ ...data, key: raw }, { status: 201 });
});
