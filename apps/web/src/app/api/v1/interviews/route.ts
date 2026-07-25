import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";
import { NextResponse } from "next/server";

import {
  INTERVIEW_STATUSES,
  createInterviewForApi,
  listInterviewsForApi,
  serializeInterview,
} from "@/features/interviews/service";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createInterviewContract,
  listInterviewsContract,
} from "@/server/api/contracts/interviews";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { interviewCreateSchema } from "@/server/api/schemas";
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

export const GET = withApi(
  buildRouteHandler(listInterviewsContract, async ({ query, auth }) => {
    const q = query as {
      limit?: number;
      cursor?: string;
      candidateId?: string;
      applicationId?: string;
      jobId?: string;
      interviewerId?: string;
      status?: string;
    };
    const status = q.status;
    if (status !== undefined && !INTERVIEW_STATUSES.includes(status as never)) {
      throw ApiError.badRequest("Invalid interview status.");
    }
    const limit = q.limit ?? parseLimit(null);
    const rows = await listInterviewsForApi({
      workspaceId: auth.workspaceId,
      candidateId: q.candidateId,
      applicationId: q.applicationId,
      jobId: q.jobId,
      interviewerId: q.interviewerId,
      status: status as never,
      cursor: decodeCursor(q.cursor ?? null),
      limit,
    });
    const { items, meta } = paginate(rows, limit, (interview) => ({
      createdAt: interview.createdAt.toISOString(),
      id: interview.id,
    }));
    return apiOk(items.map(serializeInterview), { pagination: meta });
  }),
);

export const POST = withApi(
  buildRouteHandler(
    createInterviewContract,
    async ({ body, auth, request }) => {
      const values = interviewCreateSchema.parse(body);
      const reservation = await reserveIdempotencyKey(request, auth);
      if (reservation.kind === "replay") {
        return NextResponse.json(reservation.response.body, {
          status: reservation.response.status,
        });
      }
      const interview = await createInterviewForApi({
        workspaceId: auth.workspaceId,
        actorUserId: actorUserId(auth.createdById),
        values: {
          ...values,
          scheduledAt: new Date(values.scheduledAt),
        },
      });
      const response = apiOk(serializeInterview(interview), { status: 201 });
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
