import { ApiError } from "@harly/api";

import { removePoolEntryForApi } from "@/features/pool/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import { deletePoolEntryContract } from "@/server/api/contracts/pool-entries";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

export const DELETE = withApi(
  buildRouteHandler(deletePoolEntryContract, async ({ params, auth }) => {
    const actorId = await resolveWorkspaceActorUserId(
      auth.workspaceId,
      auth.createdById,
    );
    if (!actorId) {
      throw ApiError.unprocessable(
        "Workspace has no owner to attribute this to.",
      );
    }
    await removePoolEntryForApi({
      workspaceId: auth.workspaceId,
      actorId,
      poolEntryId: params.id,
    });
    return apiOk({ deleted: true });
  }),
);
