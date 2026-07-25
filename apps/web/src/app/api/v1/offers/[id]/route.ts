import {
  getOfferForApi,
  serializeOffer,
  updateOfferForApi,
} from "@/features/offers/service";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  getOfferContract,
  updateOfferContract,
} from "@/server/api/contracts/offers";
import { apiOk, withApi } from "@/server/api/respond";
import { offerUpdateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(getOfferContract, async ({ params, auth }) => {
    const offer = await getOfferForApi({
      workspaceId: auth.workspaceId,
      offerId: params.id,
    });
    return apiOk(serializeOffer(offer));
  }),
);

export const PATCH = withApi(
  buildRouteHandler(updateOfferContract, async ({ params, body, auth }) => {
    const values = offerUpdateSchema.parse(body);
    const { startDate, expiresAt, ...patch } = values;
    const offer = await updateOfferForApi({
      workspaceId: auth.workspaceId,
      offerId: params.id,
      values: {
        ...patch,
        ...(startDate === undefined
          ? {}
          : { startDate: startDate ? new Date(startDate) : null }),
        ...(expiresAt === undefined
          ? {}
          : { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      },
    });
    return apiOk(serializeOffer(offer));
  }),
);
