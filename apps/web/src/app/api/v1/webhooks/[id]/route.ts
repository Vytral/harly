import {
  deleteWebhookEndpoint,
  serializeWebhookEndpoint,
  updateWebhookEndpoint,
} from "@/features/developers/data";
import { authenticateApiKey } from "@/server/api/auth";
import { webhookUpdateSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "webhooks:write");
  const { id } = await (context as Context).params;
  const patch = webhookUpdateSchema.parse(
    await request.json().catch(() => null),
  );
  const endpoint = await updateWebhookEndpoint({
    workspaceId: ctx.workspaceId,
    id,
    patch,
  });
  return apiOk(serializeWebhookEndpoint(endpoint));
});

export const DELETE = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "webhooks:write");
  const { id } = await (context as Context).params;
  await deleteWebhookEndpoint({ workspaceId: ctx.workspaceId, id });
  return apiOk({ deleted: true });
});
