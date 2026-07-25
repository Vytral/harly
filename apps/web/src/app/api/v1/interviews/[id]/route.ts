import { ApiError } from "@harly/api";

import {
  getInterviewForApi,
  serializeInterview,
  updateInterviewForApi,
} from "@/features/interviews/service";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  getInterviewContract,
  updateInterviewContract,
} from "@/server/api/contracts/interviews";
import { apiOk, withApi } from "@/server/api/respond";
import { interviewUpdateSchema } from "@/server/api/schemas";

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
  buildRouteHandler(getInterviewContract, async ({ params, auth }) => {
    const interview = await getInterviewForApi({
      workspaceId: auth.workspaceId,
      interviewId: params.id,
    });
    return apiOk(serializeInterview(interview));
  }),
);

export const PATCH = withApi(
  buildRouteHandler(updateInterviewContract, async ({ params, body, auth }) => {
    const values = interviewUpdateSchema.parse(body);
    const { scheduledAt, ...patch } = values;
    const interview = await updateInterviewForApi({
      workspaceId: auth.workspaceId,
      actorUserId: actorUserId(auth.createdById),
      interviewId: params.id,
      values: {
        ...patch,
        ...(scheduledAt === undefined
          ? {}
          : { scheduledAt: new Date(scheduledAt) }),
      },
    });
    return apiOk(serializeInterview(interview));
  }),
);
