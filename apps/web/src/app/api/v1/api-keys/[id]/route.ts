import { ApiError } from "@harly/api";

import { revokeApiKey } from "@/features/developers/data";
import { type ApiKeyContext } from "@/server/api/auth";
import { buildRouteHandler } from "@/server/api/contracts";
import { deleteApiKeyContract } from "@/server/api/contracts/api-keys";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

function requireSecretKey(context: ApiKeyContext): void {
  if (context.type !== "secret") {
    throw ApiError.forbidden("API key management requires a secret API key.");
  }
}

export const DELETE = withApi(
  buildRouteHandler(deleteApiKeyContract, async ({ params, auth }) => {
    requireSecretKey(auth);
    await revokeApiKey({ workspaceId: auth.workspaceId, keyId: params.id });
    return apiOk({ deleted: true });
  }),
);
