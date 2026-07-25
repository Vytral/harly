import { ApiError } from "@harly/api";
import { NextResponse } from "next/server";

import {
  serializeInterview,
  setInterviewStatusForApi,
} from "@/features/interviews/service";
import { buildRouteHandler } from "@/server/api/contracts";
import { completeInterviewContract } from "@/server/api/contracts/interviews";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

function actorUserId(createdById: string | null): string {
  if (!createdById) {
    throw ApiError.conflict(
      "This API key has no active creator and cannot perform attributed writes.",
    );
  }
  return createdById;
}

export const POST = withApi(
  buildRouteHandler(
    completeInterviewContract,
    async ({ params, auth, request }) => {
      const reservation = await reserveIdempotencyKey(request, auth);
      if (reservation.kind === "replay") {
        return NextResponse.json(reservation.response.body, {
          status: reservation.response.status,
        });
      }
      const interview = await setInterviewStatusForApi({
        workspaceId: auth.workspaceId,
        actorUserId: actorUserId(auth.createdById),
        interviewId: params.id,
        status: "completed",
      });
      const response = apiOk(serializeInterview(interview));
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
