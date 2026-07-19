import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  serializeWebhookEndpoint,
} from "@/features/developers/data";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { webhookCreateSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** GET /api/v1/webhooks , list webhook endpoints. */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "webhooks:read");
  const endpoints = await listWebhookEndpoints(ctx.workspaceId);
  return apiOk(endpoints.map(serializeWebhookEndpoint));
});

/** POST /api/v1/webhooks , create an endpoint. Secret is returned once. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "webhooks:write");
  const values = webhookCreateSchema.parse(
    await request.clone().json().catch(() => null),
  );
  const idempotency = await reserveIdempotencyKey(request, ctx);
  if (idempotency.kind === "replay") {
    return NextResponse.json(idempotency.response.body, { status: idempotency.response.status });
  }
  const { endpoint, secret } = await createWebhookEndpoint({
    workspaceId: ctx.workspaceId,
    url: values.url,
    events: values.events,
    description: values.description,
  });
  const response = apiOk(
    { ...serializeWebhookEndpoint(endpoint), secret },
    { status: 201 },
  );
  if (idempotency.kind === "reserved") {
    await idempotency.complete({
      status: response.status,
      body: { data: serializeWebhookEndpoint(endpoint) },
    });
  }
  return response;
});
