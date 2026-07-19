import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";
import type { Offer } from "@harly/db";
import { NextResponse } from "next/server";

import {
  createOfferForApi,
  listOffersForApi,
  serializeOffer,
} from "@/features/offers/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { offerCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

/** GET /api/v1/offers , cursor-paginated offer list. */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "offers:read");
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const status = url.searchParams.get("status");

  const rows = await listOffersForApi({
    workspaceId: ctx.workspaceId,
    candidateId: url.searchParams.get("candidateId") ?? undefined,
    applicationId: url.searchParams.get("applicationId") ?? undefined,
    status: status as Offer["status"] | undefined,
    cursor,
    limit,
  });
  const { items, meta } = paginate(rows, limit, (offer) => ({
    createdAt: offer.createdAt.toISOString(),
    id: offer.id,
  }));
  return apiOk(items.map(serializeOffer), { pagination: meta });
});

/** POST /api/v1/offers , create a draft offer. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "offers:write");
  const reservation = await reserveIdempotencyKey(request, ctx);
  if (reservation.kind === "replay") {
    return NextResponse.json(reservation.response.body, {
      status: reservation.response.status,
    });
  }

  const body = offerCreateSchema.parse(await request.json().catch(() => null));
  const actorUserId = await resolveWorkspaceActorUserId(
    ctx.workspaceId,
    ctx.createdById,
  );
  if (!actorUserId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }
  const offer = await createOfferForApi({
    workspaceId: ctx.workspaceId,
    actorUserId,
    applicationId: body.applicationId,
    values: {
      title: body.title,
      salaryAmount: body.salaryAmount,
      currency: body.currency,
      salaryPeriod: body.salaryPeriod,
      equity: body.equity,
      startDate: body.startDate ? new Date(body.startDate) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      notes: body.notes,
    },
  });
  const response = apiOk(serializeOffer(offer), { status: 201 });
  if (reservation.kind === "reserved") {
    await reservation.complete({
      status: response.status,
      body: await response.clone().json(),
    });
  }
  return response;
});
