import { decodeCursor, paginate, parseLimit } from "@harly/api";
import { NextResponse } from "next/server";
import { after } from "next/server";

import {
  createApplicationForApi,
  listApplicationsForApi,
  serializeApplication,
} from "@/features/applications/service";
import { scheduleAutoScore } from "@/features/applications/auto-score";
import { scheduleAutoDuplicateCheck } from "@/features/applications/auto-duplicates";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createApplicationContract,
  listApplicationsContract,
} from "@/server/api/contracts/applications";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { applicationCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = withApi(
  buildRouteHandler(listApplicationsContract, async ({ query, auth }) => {
    const q = query as {
      limit?: number;
      cursor?: string;
      jobId?: string;
      status?: string;
    };
    const limit = q.limit ?? parseLimit(null);
    const rows = await listApplicationsForApi({
      workspaceId: auth.workspaceId,
      jobId: q.jobId ?? undefined,
      status: q.status as never,
      cursor: decodeCursor(q.cursor ?? null),
      limit,
    });
    const { items, meta } = paginate(rows, limit, (application) => ({
      createdAt: application.createdAt.toISOString(),
      id: application.id,
    }));
    return apiOk(items.map(serializeApplication), { pagination: meta });
  }),
);

export const POST = withApi(
  buildRouteHandler(
    createApplicationContract,
    async ({ body, auth, request }) => {
      const values = applicationCreateSchema.parse(body);
      const reservation = await reserveIdempotencyKey(request, auth, {
        path: createApplicationContract.path,
      });
      if (reservation.kind === "replay") {
        return NextResponse.json(reservation.response.body, {
          status: reservation.response.status,
        });
      }
      const application = await createApplicationForApi({
        workspaceId: auth.workspaceId,
        jobId: values.jobId,
        candidateId: values.candidateId,
        source: values.source,
      });
      after(async () => {
        await Promise.allSettled([
          scheduleAutoScore(application.id, auth.workspaceId),
          scheduleAutoDuplicateCheck(application.candidateId, auth.workspaceId),
        ]);
      });
      const response = apiOk(serializeApplication(application), {
        status: 201,
      });
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
