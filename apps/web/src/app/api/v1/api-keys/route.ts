import { ApiError, isApiScope } from "@harly/api";
import { NextResponse } from "next/server";

import {
  createApiKey,
  listApiKeys,
  serializeApiKey,
} from "@/features/developers/data";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { hasApiScope, type ApiKeyContext } from "@/server/api/auth";
import {
  reserveIdempotencyKey,
  type IdempotencyResult,
} from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { apiKeyCreateSchema } from "@/server/api/schemas";
import { buildRouteHandler } from "@/server/api/contracts/core";
import {
  createApiKeyContract,
  listApiKeysContract,
} from "@/server/api/contracts/api-keys";

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

export const GET = withApi(
  buildRouteHandler(listApiKeysContract, async ({ auth }) => {
    requireSecretKey(auth);
    const keys = await listApiKeys(auth.workspaceId);
    return apiOk(keys.map(serializeApiKey));
  }),
);

export const POST = withApi(
  buildRouteHandler(createApiKeyContract, async ({ body, auth, request }) => {
    requireSecretKey(auth);
    const values = apiKeyCreateSchema.parse(body);
    const actorUserId = await resolveWorkspaceActorUserId(
      auth.workspaceId,
      auth.createdById,
    );
    if (!values.scopes.every(isApiScope)) {
      throw ApiError.badRequest("API key contains an invalid scope.");
    }
    if (!values.scopes.every((scope) => hasApiScope(auth.scopes, scope))) {
      throw ApiError.forbidden(
        "An API key cannot grant scopes it does not hold.",
      );
    }
    const idempotency = await reserveIdempotencyKey(request, auth);
    const replay = replayIdempotentResponse(idempotency);
    if (replay) return replay;

    const { key, raw } = await createApiKey({
      workspaceId: auth.workspaceId,
      name: values.name,
      type: values.type,
      environment: auth.environment,
      scopes: values.scopes,
      createdById: actorUserId,
      expiresAt: expiresAtFromDays(values.expiresInDays),
    });
    const data = serializeApiKey(key);
    const response = apiOk({ ...data, key: raw }, { status: 201 });
    if (idempotency.kind === "reserved") {
      await idempotency.complete({ status: 201, body: { data } });
    }
    return response;
  }),
);
