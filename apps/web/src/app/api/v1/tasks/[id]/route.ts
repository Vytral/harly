import { ApiError } from "@harly/api";

import {
  deleteTaskForApi,
  getTaskForApi,
  serializeTask,
  updateTaskForApi,
  type TaskApiUpdateInput,
} from "@/features/tasks/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";
import { taskUpdateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function taskUpdateValuesForService(
  values: ReturnType<typeof taskUpdateSchema.parse>,
): TaskApiUpdateInput {
  return {
    ...values,
    dueDate:
      values.dueDate === undefined
        ? undefined
        : values.dueDate
          ? new Date(values.dueDate)
          : null,
  };
}

async function resolveActorOrThrow(workspaceId: string, createdById: string | null) {
  const actorId = await resolveWorkspaceActorUserId(workspaceId, createdById);
  if (!actorId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }
  return actorId;
}

export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "tasks:read");
  const { id } = await (context as Context).params;
  const task = await getTaskForApi({ workspaceId: ctx.workspaceId, taskId: id });
  return apiOk(serializeTask(task));
});

export const PATCH = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "tasks:write");
  const { id } = await (context as Context).params;
  const values = taskUpdateValuesForService(
    taskUpdateSchema.parse(await request.json().catch(() => null)),
  );
  const task = await updateTaskForApi({
    workspaceId: ctx.workspaceId,
    actorId: await resolveActorOrThrow(ctx.workspaceId, ctx.createdById),
    taskId: id,
    values,
  });
  return apiOk(serializeTask(task));
});

export const DELETE = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "tasks:write");
  const { id } = await (context as Context).params;
  await deleteTaskForApi({
    workspaceId: ctx.workspaceId,
    actorId: await resolveActorOrThrow(ctx.workspaceId, ctx.createdById),
    taskId: id,
  });
  return apiOk({ deleted: true });
});
