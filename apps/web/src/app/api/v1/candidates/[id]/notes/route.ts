import {
  createCandidateNoteForApi,
  listCandidateNotesForApi,
} from "@/features/candidates/collaboration-service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createCandidateNoteContract,
  listCandidateNotesContract,
} from "@/server/api/contracts/candidates";
import { apiOk, withApi } from "@/server/api/respond";
import { candidateNoteCreateSchema } from "@/server/api/schemas";
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
  buildRouteHandler(listCandidateNotesContract, async ({ params, auth }) => {
    const notes = await listCandidateNotesForApi({
      workspaceId: auth.workspaceId,
      candidateId: params.id,
    });
    return apiOk(notes);
  }),
);

export const POST = withApi(
  buildRouteHandler(
    createCandidateNoteContract,
    async ({ params, body, auth, request }) => {
      const reservation = await reserveIdempotencyKey(request, auth, {
        path: createCandidateNoteContract.path,
      });
      if (reservation.kind === "replay") {
        return apiOk(reservation.response.body, {
          status: reservation.response.status,
        });
      }

      const values = candidateNoteCreateSchema.parse(body);
      const note = await createCandidateNoteForApi({
        workspaceId: auth.workspaceId,
        candidateId: params.id,
        actorId: await actorForWrite(auth.workspaceId, auth.createdById),
        body: values.body,
        mentions: values.mentions,
      });
      if (reservation.kind === "reserved") {
        await reservation.complete({ status: 201, body: note });
      }
      return apiOk(note, { status: 201 });
    },
  ),
);
