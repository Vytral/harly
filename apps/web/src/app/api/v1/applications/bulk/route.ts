import { after } from "next/server";
import { NextResponse } from "next/server";

import {
  createApplicationsBulkForApi,
  serializeApplication,
} from "@/features/applications/service";
import { scheduleAutoDuplicateCheck } from "@/features/applications/auto-duplicates";
import { scheduleAutoScore } from "@/features/applications/auto-score";
import { buildRouteHandler } from "@/server/api/contracts";
import { bulkApplicationsContract } from "@/server/api/contracts/applications";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { applicationBulkCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = withApi(
  buildRouteHandler(
    bulkApplicationsContract,
    async ({ body, auth, request }) => {
      const values = applicationBulkCreateSchema.parse(body);
      const reservation = await reserveIdempotencyKey(request, auth, {
        path: bulkApplicationsContract.path,
      });
      if (reservation.kind === "replay") {
        return NextResponse.json(reservation.response.body, {
          status: reservation.response.status,
        });
      }

      const items = await createApplicationsBulkForApi({
        workspaceId: auth.workspaceId,
        ...values,
      });
      const bodyResult = {
        items: items.map((item) =>
          item.outcome === "created"
            ? {
                candidateId: item.candidateId,
                outcome: item.outcome,
                application: serializeApplication(item.application),
              }
            : item,
        ),
        summary: {
          created: items.filter((item) => item.outcome === "created").length,
          conflicts: items.filter((item) => item.outcome === "conflict").length,
          failed: items.filter((item) => item.outcome === "failed").length,
        },
      };

      after(async () => {
        await Promise.allSettled(
          items.flatMap((item) =>
            item.outcome === "created"
              ? [
                  scheduleAutoScore(item.application.id, auth.workspaceId),
                  scheduleAutoDuplicateCheck(
                    item.application.candidateId,
                    auth.workspaceId,
                  ),
                ]
              : [],
          ),
        );
      });

      const status = bodyResult.summary.created === items.length ? 201 : 200;
      const response = apiOk(bodyResult, { status });
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
