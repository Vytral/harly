import { ApiError } from "@harly/api";
import { NextResponse } from "next/server";

import { decideOfferForApi, serializeOffer } from "@/features/offers/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { offerDecisionSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "offers:write");
  const reservation = await reserveIdempotencyKey(request, ctx);
  if (reservation.kind === "replay") {
    return NextResponse.json(reservation.response.body, {
      status: reservation.response.status,
    });
  }
  const { id } = await (context as Context).params;
  const body = offerDecisionSchema.parse(await request.json().catch(() => null));
  const actorUserId = await resolveWorkspaceActorUserId(
    ctx.workspaceId,
    ctx.createdById,
  );
  if (!actorUserId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }
  const offer = await decideOfferForApi({
    workspaceId: ctx.workspaceId,
    actorUserId,
    offerId: id,
    decision: body.decision,
  });
  const response = apiOk(serializeOffer(offer));
  if (reservation.kind === "reserved") {
    await reservation.complete({
      status: response.status,
      body: await response.clone().json(),
    });
  }
  return response;
});
