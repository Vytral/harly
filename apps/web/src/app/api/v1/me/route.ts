import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

/** GET /api/v1/me , introspect the authenticated API key. */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request);
  return apiOk({
    workspaceId: ctx.workspaceId,
    keyId: ctx.keyId,
    type: ctx.type,
    environment: ctx.environment,
    scopes: ctx.scopes,
  });
});
