import { ApiError } from "@harly/api";

import {
  createCandidateNoteForApi,
  listCandidateNotesForApi,
} from "@/features/candidates/collaboration-service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { candidateNoteCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function actorForWrite(workspaceId: string, createdById: string | null) {
  const actorId = await resolveWorkspaceActorUserId(workspaceId, createdById);
  if (!actorId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }
  return actorId;
}

/** GET /api/v1/candidates/:id/notes */
export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "notes:read");
  const { id } = await (context as Context).params;
  const notes = await listCandidateNotesForApi({
    workspaceId: ctx.workspaceId,
    candidateId: id,
  });
  return apiOk(notes);
});

/** POST /api/v1/candidates/:id/notes. Supports Idempotency-Key replay. */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "notes:write");
  const reservation = await reserveIdempotencyKey(request, ctx);
  if (reservation.kind === "replay") {
    return apiOk(reservation.response.body, {
      status: reservation.response.status,
    });
  }

  const { id } = await (context as Context).params;
  const values = candidateNoteCreateSchema.parse(
    await request.json().catch(() => null),
  );
  const note = await createCandidateNoteForApi({
    workspaceId: ctx.workspaceId,
    candidateId: id,
    actorId: await actorForWrite(ctx.workspaceId, ctx.createdById),
    body: values.body,
    mentions: values.mentions,
  });
  if (reservation.kind === "reserved") {
    await reservation.complete({ status: 201, body: note });
  }
  return apiOk(note, { status: 201 });
});
