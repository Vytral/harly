import { db, webhookDeliveries } from "@harly/db";

import { getWebhookEndpoint } from "@/features/developers/data";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { dispatchDueWebhooks } from "@/server/webhooks/dispatch";
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

  // Route the ping through the same claim+lock dispatcher the cron uses, so a
  // concurrent cron tick can't double-deliver the test ping (the previous
  // direct deliverWebhook call had no worker lock and raced with the cron).
  const summary = await dispatchDueWebhooks(1, [delivery.id]);
  const delivered = summary.success > 0;
  const status = delivered ? "success" : summary.failed > 0 ? "failed" : "pending";
  const response = apiOk({ delivered, status, deliveryId: delivery.id });
  if (idempotency.kind === "reserved") {
    await idempotency.complete({ status: response.status, body: await response.clone().json() });
  }
  return response;
});
