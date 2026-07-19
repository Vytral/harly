import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";

import {
  createTaskForApi,
  listTasksForApi,
  serializeTask,
  type TaskApiInput,
  type TaskPriority,
  type TaskStatus,
} from "@/features/tasks/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { taskCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

function taskValuesForService(
  values: ReturnType<typeof taskCreateSchema.parse>,
): TaskApiInput {
  return {
    ...values,
    dueDate: values.dueDate ? new Date(values.dueDate) : null,
  };
}

/** GET /api/v1/tasks , cursor-paginated active workspace tasks. */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "tasks:read");
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));

  const rows = await listTasksForApi({
    workspaceId: ctx.workspaceId,
    cursor,
    limit,
    ownerId: url.searchParams.get("ownerId") ?? undefined,
    status: (url.searchParams.get("status") as TaskStatus | null) ?? undefined,
    priority:
      (url.searchParams.get("priority") as TaskPriority | null) ?? undefined,
    candidateId: url.searchParams.get("candidateId") ?? undefined,
    applicationId: url.searchParams.get("applicationId") ?? undefined,
    jobId: url.searchParams.get("jobId") ?? undefined,
    interviewId: url.searchParams.get("interviewId") ?? undefined,
  });
  const { items, meta } = paginate(rows, limit, (task) => ({
    createdAt: task.createdAt.toISOString(),
    id: task.id,
  }));

  return apiOk(items.map(serializeTask), { pagination: meta });
});

/** POST /api/v1/tasks , create a task. Supports Idempotency-Key replay. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "tasks:write");
  const idempotency = await reserveIdempotencyKey(request, {
    workspaceId: ctx.workspaceId,
    keyId: ctx.keyId,
  });
  if (idempotency.kind === "replay") {
    return apiOk(idempotency.response.body, {
      status: idempotency.response.status,
    });
  }

  const values = taskValuesForService(
    taskCreateSchema.parse(await request.json().catch(() => null)),
  );
  const actorId = await resolveWorkspaceActorUserId(
    ctx.workspaceId,
    ctx.createdById,
  );
  if (!actorId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }

  const task = await createTaskForApi({
    workspaceId: ctx.workspaceId,
    actorId,
    values,
  });
  const body = serializeTask(task);
  if (idempotency.kind === "reserved") {
    await idempotency.complete({ status: 201, body });
  }
  return apiOk(body, { status: 201 });
});
