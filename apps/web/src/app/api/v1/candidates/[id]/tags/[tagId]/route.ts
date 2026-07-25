import { ApiError } from "@harly/api";

import { deleteCandidateTagForApi } from "@/features/candidates/collaboration-service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import { deleteCandidateTagContract } from "@/server/api/contracts/candidates";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

export const DELETE = withApi(
  buildRouteHandler(deleteCandidateTagContract, async ({ params, auth }) => {
    const actorId = await resolveWorkspaceActorUserId(
      auth.workspaceId,
      auth.createdById,
    );
    if (!actorId) {
      throw ApiError.unprocessable(
        "Workspace has no owner to attribute this to.",
      );
    }
    await deleteCandidateTagForApi({
      workspaceId: auth.workspaceId,
      candidateId: params.id,
      tagId: params.tagId,
      actorId,
    });
    return apiOk({ deleted: true });
  }),
);
