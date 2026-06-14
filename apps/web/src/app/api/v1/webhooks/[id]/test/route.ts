import { db, webhookDeliveries } from "@harly/db";

import { getWebhookEndpoint } from "@/features/developers/data";
import { authenticateApiKey } from "@/server/api/auth";
import { deliverWebhook } from "@/server/webhooks/dispatch";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/v1/webhooks/{id}/test — send a sample ping to the endpoint. */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "webhooks:manage");
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
  return apiOk({ delivered: status === "success", status, deliveryId: delivery.id });
});
