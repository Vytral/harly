import { NextResponse } from "next/server";

import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  serializeWebhookEndpoint,
} from "@/features/developers/data";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { webhookCreateSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createWebhookContract,
  listWebhooksContract,
} from "@/server/api/contracts/webhooks";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(listWebhooksContract, async ({ auth }) => {
    const endpoints = await listWebhookEndpoints(auth.workspaceId);
    return apiOk(endpoints.map(serializeWebhookEndpoint));
  }),
);

export const POST = withApi(
  buildRouteHandler(createWebhookContract, async ({ body, auth, request }) => {
    const values = webhookCreateSchema.parse(body);
    const idempotency = await reserveIdempotencyKey(request, auth);
    if (idempotency.kind === "replay") {
      return NextResponse.json(idempotency.response.body, {
        status: idempotency.response.status,
      });
    }
    const { endpoint, secret } = await createWebhookEndpoint({
      workspaceId: auth.workspaceId,
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
  }),
);
