import {
  deleteWebhookEndpoint,
  serializeWebhookEndpoint,
  updateWebhookEndpoint,
} from "@/features/developers/data";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  deleteWebhookContract,
  updateWebhookContract,
} from "@/server/api/contracts/webhooks";
import { apiOk, withApi } from "@/server/api/respond";
import { webhookUpdateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export const PATCH = withApi(
  buildRouteHandler(updateWebhookContract, async ({ params, body, auth }) => {
    const patch = webhookUpdateSchema.parse(body);
    const endpoint = await updateWebhookEndpoint({
      workspaceId: auth.workspaceId,
      id: params.id,
      patch,
    });
    return apiOk(serializeWebhookEndpoint(endpoint));
  }),
);

export const DELETE = withApi(
  buildRouteHandler(deleteWebhookContract, async ({ params, auth }) => {
    await deleteWebhookEndpoint({
      workspaceId: auth.workspaceId,
      id: params.id,
    });
    return apiOk({ deleted: true });
  }),
);
