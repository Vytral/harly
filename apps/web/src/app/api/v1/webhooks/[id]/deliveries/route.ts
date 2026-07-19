import { ApiError, parseLimit } from "@harly/api";

import {
  getWebhookEndpoint,
  listWebhookDeliveries,
  serializeDelivery,
  WEBHOOK_DELIVERY_STATUSES,
  type WebhookDeliveryStatus,
} from "@/features/developers/data";
import {
  authenticateApiKey,
  requireScope,
  type ApiKeyContext,
} from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

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

function parseStatus(value: string | null): WebhookDeliveryStatus | undefined {
  if (!value) return undefined;
  if (
    !(WEBHOOK_DELIVERY_STATUSES as readonly string[]).includes(value)
  ) {
    throw ApiError.badRequest("Invalid webhook delivery status.");
  }
  return value as WebhookDeliveryStatus;
}

/** GET /api/v1/webhooks/{id}/deliveries , endpoint-scoped delivery log. */
export const GET = withApi(async (request, context) => {
  const ctx = await authenticateWebhookApiKey(request, "webhooks:read");
  const { id } = await (context as Context).params;
  const url = new URL(request.url);

  await getWebhookEndpoint({ workspaceId: ctx.workspaceId, id });
  const deliveries = await listWebhookDeliveries({
    workspaceId: ctx.workspaceId,
    endpointId: id,
    limit: parseLimit(url.searchParams.get("limit")),
    status: parseStatus(url.searchParams.get("status")),
  });
  return apiOk(deliveries.map(serializeDelivery));
});
