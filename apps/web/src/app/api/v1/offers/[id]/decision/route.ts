import { ApiError } from "@harly/api";

import { decideOfferForApi, serializeOffer } from "@/features/offers/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import { decideOfferContract } from "@/server/api/contracts/offers";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

export const POST = withApi(
  buildRouteHandler(decideOfferContract, async ({ params, body, auth }) => {
    const decisionBody = body as { decision: "accepted" | "declined" };
    const actorUserId = await resolveWorkspaceActorUserId(
      auth.workspaceId,
      auth.createdById,
    );
    if (!actorUserId) {
      throw ApiError.unprocessable(
        "Workspace has no owner to attribute this to.",
      );
    }

    const offer = await decideOfferForApi({
      workspaceId: auth.workspaceId,
      actorUserId,
      offerId: params.id,
      decision: decisionBody.decision,
    });

    return apiOk(serializeOffer(offer));
  }),
);
