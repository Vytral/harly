import { ApiError } from "@harly/api";

import { removePoolEntryForApi } from "@/features/pool/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const DELETE = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "pool:write");
  const { id } = await (context as Context).params;
  const actorId = await resolveWorkspaceActorUserId(
    ctx.workspaceId,
    ctx.createdById,
  );
  if (!actorId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }
  await removePoolEntryForApi({
    workspaceId: ctx.workspaceId,
    actorId,
    poolEntryId: id,
  });
  return apiOk({ deleted: true });
});
