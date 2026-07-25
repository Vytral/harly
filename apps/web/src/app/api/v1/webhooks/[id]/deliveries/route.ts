import { ApiError, parseLimit } from "@harly/api";

import {
  getWebhookEndpoint,
  listWebhookDeliveries,
  serializeDelivery,
  WEBHOOK_DELIVERY_STATUSES,
  type WebhookDeliveryStatus,
} from "@/features/developers/data";
import { buildRouteHandler } from "@/server/api/contracts";
import { listWebhookDeliveriesContract } from "@/server/api/contracts/webhooks";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

function parseStatus(value: string | null): WebhookDeliveryStatus | undefined {
  if (!value) return undefined;
  if (!(WEBHOOK_DELIVERY_STATUSES as readonly string[]).includes(value)) {
    throw ApiError.badRequest("Invalid webhook delivery status.");
  }
  return value as WebhookDeliveryStatus;
}

export const GET = withApi(
  buildRouteHandler(
    listWebhookDeliveriesContract,
    async ({ query, params, auth }) => {
      const q = query as { limit?: number; status?: string };
      await getWebhookEndpoint({
        workspaceId: auth.workspaceId,
        id: params.id,
      });
      const deliveries = await listWebhookDeliveries({
        workspaceId: auth.workspaceId,
        endpointId: params.id,
        limit: q.limit ?? parseLimit(null),
        status: parseStatus(q.status ?? null),
      });
      return apiOk(deliveries.map(serializeDelivery));
    },
  ),
);
