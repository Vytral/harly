import { NextResponse } from "next/server";

import {
  replayWebhookDelivery,
  serializeDelivery,
} from "@/features/developers/data";
import { buildRouteHandler } from "@/server/api/contracts";
import { replayWebhookDeliveryContract } from "@/server/api/contracts/webhooks";
import {
  reserveIdempotencyKey,
  type IdempotencyResult,
} from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

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
  buildRouteHandler(
    replayWebhookDeliveryContract,
    async ({ params, auth, request }) => {
      const idempotency = await reserveIdempotencyKey(request, auth);
      const replay = replayIdempotentResponse(idempotency);
      if (replay) return replay;

      const delivery = await replayWebhookDelivery({
        workspaceId: auth.workspaceId,
        endpointId: params.id,
        deliveryId: params.deliveryId,
      });
      const data = serializeDelivery(delivery);
      const response = apiOk(data, { status: 202 });
      if (idempotency.kind === "reserved") {
        await idempotency.complete({ status: 202, body: { data } });
      }
      return response;
    },
  ),
);
