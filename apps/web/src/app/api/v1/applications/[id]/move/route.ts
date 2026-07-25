import {
  moveApplicationStageForApi,
  serializeApplication,
} from "@/features/applications/service";
import { buildRouteHandler } from "@/server/api/contracts";
import { moveApplicationContract } from "@/server/api/contracts/applications";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { applicationMoveSchema } from "@/server/api/schemas";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const POST = withApi(
  buildRouteHandler(
    moveApplicationContract,
    async ({ params, body, auth, request }) => {
      const reservation = await reserveIdempotencyKey(request, auth, {
        path: moveApplicationContract.path,
      });
      if (reservation.kind === "replay") {
        return NextResponse.json(reservation.response.body, {
          status: reservation.response.status,
        });
      }
      const { toStageId } = applicationMoveSchema.parse(body);
      const application = await moveApplicationStageForApi({
        workspaceId: auth.workspaceId,
        applicationId: params.id,
        toStageId,
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
