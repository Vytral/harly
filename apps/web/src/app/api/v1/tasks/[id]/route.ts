import { ApiError } from "@harly/api";

import {
  deleteTaskForApi,
  getTaskForApi,
  serializeTask,
  updateTaskForApi,
} from "@/features/tasks/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  deleteTaskContract,
  getTaskContract,
  updateTaskContract,
} from "@/server/api/contracts/tasks";
import { apiOk, withApi } from "@/server/api/respond";
import { taskUpdateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

async function resolveActorOrThrow(
  workspaceId: string,
  createdById: string | null,
) {
  const actorId = await resolveWorkspaceActorUserId(workspaceId, createdById);
  if (!actorId) {
    throw ApiError.unprocessable(
      "Workspace has no owner to attribute this to.",
    );
  }
  return actorId;
}

export const GET = withApi(
  buildRouteHandler(getTaskContract, async ({ params, auth }) => {
    const task = await getTaskForApi({
      workspaceId: auth.workspaceId,
      taskId: params.id,
    });
    return apiOk(serializeTask(task));
  }),
);

export const PATCH = withApi(
  buildRouteHandler(updateTaskContract, async ({ params, body, auth }) => {
    const values = taskUpdateSchema.parse(body);
    const task = await updateTaskForApi({
      workspaceId: auth.workspaceId,
      actorId: await resolveActorOrThrow(auth.workspaceId, auth.createdById),
      taskId: params.id,
      values: {
        ...values,
        dueDate:
          values.dueDate === undefined
            ? undefined
            : values.dueDate
              ? new Date(values.dueDate)
              : null,
      },
    });
    return apiOk(serializeTask(task));
  }),
);

export const DELETE = withApi(
  buildRouteHandler(deleteTaskContract, async ({ params, auth }) => {
    await deleteTaskForApi({
      workspaceId: auth.workspaceId,
      actorId: await resolveActorOrThrow(auth.workspaceId, auth.createdById),
      taskId: params.id,
    });
    return apiOk({ deleted: true });
  }),
);
