import {
  getOfferForApi,
  serializeOffer,
  updateOfferForApi,
} from "@/features/offers/service";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";
import { offerUpdateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "offers:read");
  const { id } = await (context as Context).params;
  const offer = await getOfferForApi({ workspaceId: ctx.workspaceId, offerId: id });
  return apiOk(serializeOffer(offer));
});

export const PATCH = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "offers:write");
  const { id } = await (context as Context).params;
  const body = offerUpdateSchema.parse(await request.json().catch(() => null));
  const { startDate, expiresAt, ...patch } = body;
  const offer = await updateOfferForApi({
    workspaceId: ctx.workspaceId,
    offerId: id,
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
});
