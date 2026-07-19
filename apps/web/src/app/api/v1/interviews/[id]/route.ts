import { ApiError } from "@harly/api";

import {
  getInterviewForApi,
  serializeInterview,
  updateInterviewForApi,
} from "@/features/interviews/service";
import { authenticateApiKey } from "@/server/api/auth";
import { interviewUpdateSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function actorUserId(createdById: string | null): string {
  if (!createdById) {
    throw ApiError.conflict(
      "This API key has no active creator and cannot perform attributed writes.",
    );
  }
  return createdById;
}

export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "interviews:read");
  const { id } = await (context as Context).params;
  const interview = await getInterviewForApi({
    workspaceId: ctx.workspaceId,
    interviewId: id,
  });
  return apiOk(serializeInterview(interview));
});

export const PATCH = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "interviews:write");
  const { id } = await (context as Context).params;
  const values = interviewUpdateSchema.parse(
    await request.json().catch(() => null),
  );
  const { scheduledAt, ...patch } = values;
  const interview = await updateInterviewForApi({
    workspaceId: ctx.workspaceId,
    actorUserId: actorUserId(ctx.createdById),
    interviewId: id,
    values: {
      ...patch,
      ...(scheduledAt === undefined ? {} : { scheduledAt: new Date(scheduledAt) }),
    },
  });
  return apiOk(serializeInterview(interview));
});
