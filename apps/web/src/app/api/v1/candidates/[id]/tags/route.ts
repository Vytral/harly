import { ApiError } from "@harly/api";

import {
  createCandidateTagForApi,
  listCandidateTagsForApi,
} from "@/features/candidates/collaboration-service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { candidateTagCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function actorForWrite(workspaceId: string, createdById: string | null) {
  const actorId = await resolveWorkspaceActorUserId(workspaceId, createdById);
  if (!actorId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }
  return actorId;
}

/** GET /api/v1/candidates/:id/tags */
export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "tags:read");
  const { id } = await (context as Context).params;
  const tags = await listCandidateTagsForApi({
    workspaceId: ctx.workspaceId,
    candidateId: id,
  });
  return apiOk(tags);
});

/** POST /api/v1/candidates/:id/tags. Supports Idempotency-Key replay. */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "tags:write");
  const reservation = await reserveIdempotencyKey(request, ctx);
  if (reservation.kind === "replay") {
    return apiOk(reservation.response.body, {
      status: reservation.response.status,
    });
  }

  const { id } = await (context as Context).params;
  const values = candidateTagCreateSchema.parse(
    await request.json().catch(() => null),
  );
  const result = await createCandidateTagForApi({
    workspaceId: ctx.workspaceId,
    candidateId: id,
    actorId: await actorForWrite(ctx.workspaceId, ctx.createdById),
    label: values.label,
  });
  const status = result.created ? 201 : 200;
  if (reservation.kind === "reserved") {
    await reservation.complete({ status, body: result.tag });
  }
  return apiOk(result.tag, { status });
});
