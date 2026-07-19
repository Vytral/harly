import { NextResponse } from "next/server";

import {
  replayWebhookDelivery,
  serializeDelivery,
} from "@/features/developers/data";
import {
  authenticateApiKey,
  requireScope,
  type ApiKeyContext,
} from "@/server/api/auth";
import {
  reserveIdempotencyKey,
  type IdempotencyResult,
} from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; deliveryId: string }> };

async function authenticateWebhookApiKey(
  request: Request,
  scope: "webhooks:read" | "webhooks:write",
): Promise<ApiKeyContext> {
  const ctx = await authenticateApiKey(request);
  if (!ctx.scopes.includes(scope) && !ctx.scopes.includes("webhooks:manage")) {
    requireScope(ctx, scope);
  }
  return ctx;
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

/** POST /api/v1/webhooks/{id}/deliveries/{deliveryId}/replay , queue a fresh replay. */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateWebhookApiKey(request, "webhooks:write");
  const { id, deliveryId } = await (context as Context).params;
  const idempotency = await reserveIdempotencyKey(request, {
    workspaceId: ctx.workspaceId,
    keyId: ctx.keyId,
  });
  const replay = replayIdempotentResponse(idempotency);
  if (replay) return replay;

  const delivery = await replayWebhookDelivery({
    workspaceId: ctx.workspaceId,
    endpointId: id,
    deliveryId,
  });
  const data = serializeDelivery(delivery);
  if (idempotency.kind === "reserved") {
    await idempotency.complete({ status: 202, body: { data } });
  }
  return apiOk(data, { status: 202 });
});
