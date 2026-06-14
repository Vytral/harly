import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  serializeWebhookEndpoint,
} from "@/features/developers/data";
import { authenticateApiKey } from "@/server/api/auth";
import { webhookCreateSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

/** GET /api/v1/webhooks — list webhook endpoints. */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "webhooks:manage");
  const endpoints = await listWebhookEndpoints(ctx.workspaceId);
  return apiOk(endpoints.map(serializeWebhookEndpoint));
});

/** POST /api/v1/webhooks — create an endpoint. Secret is returned once. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "webhooks:manage");
  const values = webhookCreateSchema.parse(
    await request.json().catch(() => null),
  );
  const { endpoint, secret } = await createWebhookEndpoint({
    workspaceId: ctx.workspaceId,
    url: values.url,
    events: values.events,
    description: values.description,
  });
  return apiOk(
    { ...serializeWebhookEndpoint(endpoint), secret },
    { status: 201 },
  );
});
