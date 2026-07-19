import { revokeApiKey } from "@/features/developers/data";
import { authenticateApiKey, type ApiKeyContext } from "@/server/api/auth";
import { ApiError } from "@harly/api";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function requireSecretKey(context: ApiKeyContext): void {
  if (context.type !== "secret") {
    throw ApiError.forbidden("API key management requires a secret API key.");
  }
}

/** DELETE /api/v1/api-keys/{id} , revoke an API key. */
export const DELETE = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "api_keys:write");
  requireSecretKey(ctx);
  const { id } = await (context as Context).params;
  await revokeApiKey({ workspaceId: ctx.workspaceId, keyId: id });
  return apiOk({ deleted: true });
});
