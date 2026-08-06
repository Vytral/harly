import { ApiError } from "@harly/api";
import { NextResponse } from "next/server";

import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  serializeApiKey,
} from "@/features/developers/data";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { type ApiKeyContext } from "@/server/api/auth";
import { buildRouteHandler } from "@/server/api/contracts";
import { rotateApiKeyContract } from "@/server/api/contracts/api-keys";
import { canRotateApiKeyScopes } from "@/server/api/key-scope";
import {
  reserveIdempotencyKey,
  type IdempotencyResult,
} from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

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

export const POST = withApi(
  buildRouteHandler(rotateApiKeyContract, async ({ params, auth, request }) => {
    requireSecretKey(auth);
    const idempotency = await reserveIdempotencyKey(request, auth);
    const replay = replayIdempotentResponse(idempotency);
    if (replay) return replay;

    const existing = (await listApiKeys(auth.workspaceId)).find(
      (key) => key.id === params.id,
    );
    if (!existing) throw ApiError.notFound("API key not found.");
    if (existing.revokedAt) {
      throw ApiError.conflict("A revoked API key cannot be rotated.");
    }
    const existingScopes = Array.isArray(existing.scopes)
      ? (existing.scopes as string[])
      : [];
    const callerScopes = auth.scopes as readonly string[];
    if (!canRotateApiKeyScopes(existingScopes, callerScopes)) {
      throw ApiError.forbidden(
        "You cannot rotate an API key with broader scopes.",
      );
    }

    const actorUserId = await resolveWorkspaceActorUserId(
      auth.workspaceId,
      auth.createdById,
    );

    const { key, raw } = await createApiKey({
      workspaceId: auth.workspaceId,
      name: existing.name,
      type: existing.type as "publishable" | "secret",
      environment: existing.environment as "live" | "test",
      scopes: existing.scopes as string[],
      createdById: actorUserId,
      expiresAt: existing.expiresAt ? new Date(existing.expiresAt) : null,
    });
    await revokeApiKey({ workspaceId: auth.workspaceId, keyId: existing.id });

    const data = { replacedKeyId: existing.id, apiKey: serializeApiKey(key) };
    const response = apiOk({ ...data, key: raw }, { status: 201 });
    if (idempotency.kind === "reserved") {
      await idempotency.complete({ status: 201, body: { data } });
    }
    return response;
  }),
);
