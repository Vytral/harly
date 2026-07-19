import {
  hireApplicationForApi,
  serializeApplication,
} from "@/features/applications/service";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/v1/applications/{id}/hire , mark hired (fires application.hired). */
export const POST = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "applications:write");
  const idempotency = await reserveIdempotencyKey(request, ctx);
  if (idempotency.kind === "replay") {
    return NextResponse.json(idempotency.response.body, { status: idempotency.response.status });
  }
  const { id } = await (context as Context).params;
  const application = await hireApplicationForApi({
    workspaceId: ctx.workspaceId,
    applicationId: id,
  });
  const response = apiOk(serializeApplication(application));
  if (idempotency.kind === "reserved") {
    await idempotency.complete({ status: response.status, body: await response.clone().json() });
  }
  return response;
});
