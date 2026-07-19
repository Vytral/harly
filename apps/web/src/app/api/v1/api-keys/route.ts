import { ApiError, isApiScope } from "@harly/api";
import { NextResponse } from "next/server";

import {
  createApiKey,
  listApiKeys,
  serializeApiKey,
} from "@/features/developers/data";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import {
  authenticateApiKey,
  hasApiScope,
  type ApiKeyContext,
} from "@/server/api/auth";
import {
  reserveIdempotencyKey,
  type IdempotencyResult,
} from "@/server/api/idempotency";
import { apiKeyCreateSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

function requireSecretKey(context: ApiKeyContext): void {
  if (context.type !== "secret") {
    throw ApiError.forbidden("API key management requires a secret API key.");
  }
}

function expiresAtFromDays(days: number | null | undefined): Date | null {
  return days ? new Date(Date.now() + days * 86_400_000) : null;
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

/** GET /api/v1/api-keys , list masked workspace API keys. */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "api_keys:read");
  requireSecretKey(ctx);
  const keys = await listApiKeys(ctx.workspaceId);
  return apiOk(keys.map(serializeApiKey));
});

/** POST /api/v1/api-keys , create a key. Raw key is returned once. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "api_keys:write");
  requireSecretKey(ctx);
  const values = apiKeyCreateSchema.parse(
    await request
      .clone()
      .json()
      .catch(() => null),
  );
  const actorUserId = await resolveWorkspaceActorUserId(
    ctx.workspaceId,
    ctx.createdById,
  );
  if (!values.scopes.every(isApiScope)) {
    throw ApiError.badRequest("API key contains an invalid scope.");
  }
  if (!values.scopes.every((scope) => hasApiScope(ctx.scopes, scope))) {
    throw ApiError.forbidden(
      "An API key cannot grant scopes it does not hold.",
    );
  }
  const idempotency = await reserveIdempotencyKey(request, {
    workspaceId: ctx.workspaceId,
    keyId: ctx.keyId,
  });
  const replay = replayIdempotentResponse(idempotency);
  if (replay) return replay;

  const { key, raw } = await createApiKey({
    workspaceId: ctx.workspaceId,
    name: values.name,
    type: values.type,
    environment: ctx.environment,
    scopes: values.scopes,
    createdById: actorUserId,
    expiresAt: expiresAtFromDays(values.expiresInDays),
  });
  const data = serializeApiKey(key);
  if (idempotency.kind === "reserved") {
    // Do not persist `raw`: API keys must remain recoverable only from creation.
    await idempotency.complete({ status: 201, body: { data } });
  }
  return apiOk({ ...data, key: raw }, { status: 201 });
});
