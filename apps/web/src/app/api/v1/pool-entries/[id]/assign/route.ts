import { ApiError } from "@harly/api";
import { z } from "zod";

import { serializeApplication } from "@/features/applications/service";
import { assignPoolEntryToJobForApi } from "@/features/pool/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const assignSchema = z.object({ jobId: z.uuid() });

/** POST /api/v1/pool-entries/{id}/assign , create application from pool entry. */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "pool:write");
  const { id } = await (context as Context).params;
  const idempotency = await reserveIdempotencyKey(request, {
    workspaceId: ctx.workspaceId,
    keyId: ctx.keyId,
  });
  if (idempotency.kind === "replay") {
    return apiOk(idempotency.response.body, {
      status: idempotency.response.status,
    });
  }

  const { jobId } = assignSchema.parse(
    await request.json().catch(() => null),
  );
  const actorId = await resolveWorkspaceActorUserId(
    ctx.workspaceId,
    ctx.createdById,
  );
  if (!actorId) {
    throw ApiError.unprocessable("Workspace has no owner to attribute this to.");
  }
  const application = await assignPoolEntryToJobForApi({
    workspaceId: ctx.workspaceId,
    actorId,
    poolEntryId: id,
    jobId,
  });
  const body = serializeApplication(application);
  if (idempotency.kind === "reserved") {
    await idempotency.complete({ status: 201, body });
  }
  return apiOk(body, { status: 201 });
});
