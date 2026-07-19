import {
  moveApplicationStageForApi,
  serializeApplication,
} from "@/features/applications/service";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { applicationMoveSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/v1/applications/{id}/move , move to a pipeline stage. */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "applications:write");
  const idempotency = await reserveIdempotencyKey(request, ctx);
  if (idempotency.kind === "replay") {
    return NextResponse.json(idempotency.response.body, { status: idempotency.response.status });
  }
  const { id } = await (context as Context).params;
  const { toStageId } = applicationMoveSchema.parse(
    await request.json().catch(() => null),
  );
  const application = await moveApplicationStageForApi({
    workspaceId: ctx.workspaceId,
    applicationId: id,
    toStageId,
  });
  const response = apiOk(serializeApplication(application));
  if (idempotency.kind === "reserved") {
    await idempotency.complete({ status: response.status, body: await response.clone().json() });
  }
  return response;
});
