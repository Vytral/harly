import { ApiError } from "@harly/api";

import { deleteCandidateTagForApi } from "@/features/candidates/collaboration-service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; tagId: string }> };

export const DELETE = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "tags:write");
  const { id, tagId } = await (context as Context).params;
  const actorId = await resolveWorkspaceActorUserId(
    ctx.workspaceId,
    ctx.createdById,
  );
  if (!actorId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }
  await deleteCandidateTagForApi({
    workspaceId: ctx.workspaceId,
    candidateId: id,
    tagId,
    actorId,
  });
  return apiOk({ deleted: true });
});
