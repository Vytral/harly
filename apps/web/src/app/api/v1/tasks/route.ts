import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";
import { NextResponse } from "next/server";

import {
  createTaskForApi,
  listTasksForApi,
  serializeTask,
} from "@/features/tasks/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createTaskContract,
  listTasksContract,
} from "@/server/api/contracts/tasks";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { taskCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(listTasksContract, async ({ query, auth }) => {
    const q = query as {
      limit?: number;
      cursor?: string;
      ownerId?: string;
      status?: "pending" | "in_progress" | "completed" | "canceled";
      priority?: "low" | "medium" | "high" | "urgent";
      candidateId?: string;
      applicationId?: string;
      jobId?: string;
      interviewId?: string;
    };
    const limit = q.limit ?? parseLimit(null);
    const rows = await listTasksForApi({
      workspaceId: auth.workspaceId,
      cursor: decodeCursor(q.cursor ?? null),
      limit,
      ownerId: q.ownerId,
      status: q.status,
      priority: q.priority,
      candidateId: q.candidateId,
      applicationId: q.applicationId,
      jobId: q.jobId,
      interviewId: q.interviewId,
    });
    const { items, meta } = paginate(rows, limit, (task) => ({
      createdAt: task.createdAt.toISOString(),
      id: task.id,
    }));
    return apiOk(items.map(serializeTask), { pagination: meta });
  }),
);

export const POST = withApi(
  buildRouteHandler(createTaskContract, async ({ body, auth, request }) => {
    const values = taskCreateSchema.parse(body);
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
    const task = await createTaskForApi({
      workspaceId: auth.workspaceId,
      actorId,
      values: {
        ...values,
        dueDate: values.dueDate ? new Date(values.dueDate) : null,
      },
    });
    const bodyJson = serializeTask(task);
    const response = apiOk(bodyJson, { status: 201 });
    if (reservation.kind === "reserved") {
      await reservation.complete({ status: response.status, body: bodyJson });
    }
    return response;
  }),
);
