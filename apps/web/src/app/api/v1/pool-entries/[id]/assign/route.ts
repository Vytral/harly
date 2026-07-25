import { ApiError } from "@harly/api";
import { NextResponse } from "next/server";
import { z } from "zod";

import { serializeApplication } from "@/features/applications/service";
import { assignPoolEntryToJobForApi } from "@/features/pool/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import { assignPoolEntryContract } from "@/server/api/contracts/pool-entries";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

const bodySchema = z.object({ jobId: z.string().uuid() });

export const POST = withApi(
  buildRouteHandler(
    assignPoolEntryContract,
    async ({ params, body, auth, request }) => {
      const values = bodySchema.parse(body);
      const reservation = await reserveIdempotencyKey(request, auth);
      if (reservation.kind === "replay") {
        return NextResponse.json(reservation.response.body, {
          status: reservation.response.status,
        });
      }
      const actorId = await resolveWorkspaceActorUserId(
        auth.workspaceId,
        auth.createdById,
      );
      if (!actorId) {
        throw ApiError.unprocessable(
          "Workspace has no owner to attribute this to.",
        );
      }
      const application = await assignPoolEntryToJobForApi({
        workspaceId: auth.workspaceId,
        actorId,
        poolEntryId: params.id,
        jobId: values.jobId,
      });
      const bodyJson = serializeApplication(application);
      const response = apiOk(bodyJson, { status: 201 });
      if (reservation.kind === "reserved") {
        await reservation.complete({ status: response.status, body: bodyJson });
      }
      return response;
    },
  ),
);
