import { db, webhookDeliveries } from "@harly/db";
import { NextResponse } from "next/server";

import { getWebhookEndpoint } from "@/features/developers/data";
import { buildRouteHandler } from "@/server/api/contracts";
import { testWebhookContract } from "@/server/api/contracts/webhooks";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { dispatchDueWebhooks } from "@/server/webhooks/dispatch";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

export const POST = withApi(
  buildRouteHandler(testWebhookContract, async ({ params, auth, request }) => {
    const idempotency = await reserveIdempotencyKey(request, auth);
    if (idempotency.kind === "replay") {
      return NextResponse.json(idempotency.response.body, {
        status: idempotency.response.status,
      });
    }
    const endpoint = await getWebhookEndpoint({
      workspaceId: auth.workspaceId,
      id: params.id,
    });

    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        workspaceId: auth.workspaceId,
        endpointId: endpoint.id,
        event: "application.created",
        payload: {
          event: "application.created",
          created: Math.floor(Date.now() / 1000),
          workspace: auth.workspaceId,
          data: { test: true, message: "Harly webhook test ping." },
        },
        status: "pending",
      })
      .returning();

    const summary = await dispatchDueWebhooks(1, [delivery.id]);
    const delivered = summary.success > 0;
    const status = delivered
      ? "success"
      : summary.failed > 0
        ? "failed"
        : "pending";
    const response = apiOk({ delivered, status, deliveryId: delivery.id });
    if (idempotency.kind === "reserved") {
      await idempotency.complete({
        status: response.status,
        body: await response.clone().json(),
      });
    }
    return response;
  }),
);
