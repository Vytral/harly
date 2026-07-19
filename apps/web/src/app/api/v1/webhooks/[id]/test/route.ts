import { db, webhookDeliveries } from "@harly/db";

import { getWebhookEndpoint } from "@/features/developers/data";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { deliverWebhook } from "@/server/webhooks/dispatch";
import { apiOk, withApi } from "@/server/api/respond";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/v1/webhooks/{id}/test , send a sample ping to the endpoint. */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "webhooks:write");
  const idempotency = await reserveIdempotencyKey(request, ctx);
  if (idempotency.kind === "replay") {
    return NextResponse.json(idempotency.response.body, { status: idempotency.response.status });
  }
  const { id } = await (context as Context).params;
  const endpoint = await getWebhookEndpoint({
    workspaceId: ctx.workspaceId,
    id,
  });

  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      workspaceId: ctx.workspaceId,
      endpointId: endpoint.id,
      event: "application.created",
      payload: {
        event: "application.created",
        created: Math.floor(Date.now() / 1000),
        workspace: ctx.workspaceId,
        data: { test: true, message: "Harly webhook test ping." },
      },
      status: "pending",
    })
    .returning();

  const status = await deliverWebhook(delivery, endpoint);
  const response = apiOk({ delivered: status === "success", status, deliveryId: delivery.id });
  if (idempotency.kind === "reserved") {
    await idempotency.complete({ status: response.status, body: await response.clone().json() });
  }
  return response;
});
