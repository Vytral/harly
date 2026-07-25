import {
  rejectApplicationForApi,
  serializeApplication,
} from "@/features/applications/service";
import { buildRouteHandler } from "@/server/api/contracts";
import { rejectApplicationContract } from "@/server/api/contracts/applications";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const POST = withApi(
  buildRouteHandler(
    rejectApplicationContract,
    async ({ params, auth, request }) => {
      const reservation = await reserveIdempotencyKey(request, auth, {
        path: rejectApplicationContract.path,
      });
      if (reservation.kind === "replay") {
        return NextResponse.json(reservation.response.body, {
          status: reservation.response.status,
        });
      }
      const application = await rejectApplicationForApi({
        workspaceId: auth.workspaceId,
        applicationId: params.id,
      });
      const response = apiOk(serializeApplication(application));
      if (reservation.kind === "reserved") {
        await reservation.complete({
          status: response.status,
          body: await response.clone().json(),
        });
      }
      return response;
    },
  ),
);
