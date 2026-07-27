import { apiOk, withApi } from "@/server/api/respond";
import { buildRouteHandler } from "@/server/api/contracts";
import { listWebhookDeliveryAttemptsContract } from "@/server/api/contracts/webhooks";
import { listWebhookDeliveryAttempts } from "@/features/developers/data";

export const runtime = "nodejs";

export const GET = withApi(buildRouteHandler(listWebhookDeliveryAttemptsContract, async ({ params, auth }) => {
  const rows = await listWebhookDeliveryAttempts({ workspaceId: auth.workspaceId, endpointId: params.id, deliveryId: params.deliveryId });
  return apiOk(rows.map(({ webhook_delivery_attempts: attempt }) => ({
    id: attempt.id,
    attempt: attempt.attempt,
    status: attempt.status,
    responseStatus: attempt.responseStatus,
    error: attempt.error,
    startedAt: attempt.startedAt.toISOString(),
    finishedAt: attempt.finishedAt?.toISOString() ?? null,
  })));
}));
