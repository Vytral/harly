import { decodeCursor, paginate, parseLimit } from "@harly/api";
import { NextResponse } from "next/server";

import {
  createOfferForApi,
  listOffersForApi,
  serializeOffer,
} from "@/features/offers/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createOfferContract,
  listOffersContract,
} from "@/server/api/contracts/offers";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { offerCreateSchema } from "@/server/api/schemas";
import { ApiError } from "@harly/api";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(listOffersContract, async ({ query, auth }) => {
    const q = query as {
      limit?: number;
      cursor?: string;
      candidateId?: string;
      applicationId?: string;
      status?: string;
    };
    const rows = await listOffersForApi({
      workspaceId: auth.workspaceId,
      candidateId: q.candidateId,
      applicationId: q.applicationId,
      status: q.status as never,
      cursor: decodeCursor(q.cursor ?? null),
      limit: q.limit ?? parseLimit(null),
    });
    const { items, meta } = paginate(
      rows,
      q.limit ?? parseLimit(null),
      (offer) => ({
        createdAt: offer.createdAt.toISOString(),
        id: offer.id,
      }),
    );
    return apiOk(items.map(serializeOffer), { pagination: meta });
  }),
);

export const POST = withApi(
  buildRouteHandler(createOfferContract, async ({ body, auth, request }) => {
    const values = offerCreateSchema.parse(body);
    const reservation = await reserveIdempotencyKey(request, auth);
    if (reservation.kind === "replay") {
      return NextResponse.json(reservation.response.body, {
        status: reservation.response.status,
      });
    }
    const actor = await resolveWorkspaceActorUserId(
      auth.workspaceId,
      auth.createdById,
    );
    if (!actor) {
      throw ApiError.unprocessable(
        "Workspace has no owner to attribute this to.",
      );
    }
    const offer = await createOfferForApi({
      workspaceId: auth.workspaceId,
      actorUserId: actor,
      applicationId: values.applicationId,
      values: {
        title: values.title,
        salaryAmount: values.salaryAmount,
        currency: values.currency,
        salaryPeriod: values.salaryPeriod,
        equity: values.equity,
        startDate: values.startDate ? new Date(values.startDate) : null,
        expiresAt: values.expiresAt ? new Date(values.expiresAt) : null,
        notes: values.notes,
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
  }),
);
