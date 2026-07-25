import { ApiError } from "@harly/api";

import { sendOfferForApi, serializeOffer } from "@/features/offers/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import { sendOfferContract } from "@/server/api/contracts/offers";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

export const POST = withApi(
  buildRouteHandler(sendOfferContract, async ({ params, auth }) => {
    const actorUserId = await resolveWorkspaceActorUserId(
      auth.workspaceId,
      auth.createdById,
    );
    if (!actorUserId) {
      throw ApiError.unprocessable(
        "Workspace has no owner to attribute this to.",
      );
    }

    const offer = await sendOfferForApi({
      workspaceId: auth.workspaceId,
      actorUserId,
      offerId: params.id,
    });

    return apiOk(serializeOffer(offer));
  }),
);
