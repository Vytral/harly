import {
  createCandidateTagForApi,
  listCandidateTagsForApi,
} from "@/features/candidates/collaboration-service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createCandidateTagContract,
  listCandidateTagsContract,
} from "@/server/api/contracts/candidates";
import { apiOk, withApi } from "@/server/api/respond";
import { candidateTagCreateSchema } from "@/server/api/schemas";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { ApiError } from "@harly/api";

export const runtime = "nodejs";

async function actorForWrite(workspaceId: string, createdById: string | null) {
  const actorId = await resolveWorkspaceActorUserId(workspaceId, createdById);
  if (!actorId) {
    throw ApiError.unprocessable(
      "Workspace has no owner to attribute this to.",
    );
  }
  return actorId;
}

export const GET = withApi(
  buildRouteHandler(listCandidateTagsContract, async ({ params, auth }) => {
    const tags = await listCandidateTagsForApi({
      workspaceId: auth.workspaceId,
      candidateId: params.id,
    });
    return apiOk(tags);
  }),
);

export const POST = withApi(
  buildRouteHandler(
    createCandidateTagContract,
    async ({ params, body, auth, request }) => {
      const reservation = await reserveIdempotencyKey(request, auth, {
        path: createCandidateTagContract.path,
      });
      if (reservation.kind === "replay") {
        return apiOk(reservation.response.body, {
          status: reservation.response.status,
        });
      }

      const values = candidateTagCreateSchema.parse(body);
      const result = await createCandidateTagForApi({
        workspaceId: auth.workspaceId,
        candidateId: params.id,
        actorId: await actorForWrite(auth.workspaceId, auth.createdById),
        label: values.label,
      });
      const status = result.created ? 201 : 200;
      if (reservation.kind === "reserved") {
        await reservation.complete({ status, body: result.tag });
      }
      return apiOk(result.tag, { status });
    },
  ),
);
