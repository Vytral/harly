import { decodeCursor, paginate, parseLimit } from "@harly/api";
import type { Application } from "@harly/db";
import { after } from "next/server";

import {
  createApplicationForApi,
  listApplicationsForApi,
  serializeApplication,
} from "@/features/applications/service";
import { authenticateApiKey } from "@/server/api/auth";
import { applicationCreateSchema } from "@/server/api/schemas";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { scheduleAutoScore } from "@/features/applications/auto-score";
import { scheduleAutoDuplicateCheck } from "@/features/applications/auto-duplicates";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/v1/applications , list applications (filters: jobId, status). */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "applications:read");
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));

  const rows = await listApplicationsForApi({
    workspaceId: ctx.workspaceId,
    jobId: url.searchParams.get("jobId") ?? undefined,
    status:
      (url.searchParams.get("status") as Application["status"] | null) ??
      undefined,
    cursor,
    limit,
  });
  const { items, meta } = paginate(rows, limit, (application) => ({
    createdAt: application.createdAt.toISOString(),
    id: application.id,
  }));

  return apiOk(items.map(serializeApplication), { pagination: meta });
});

/** POST /api/v1/applications , manually create an application. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "applications:write");
  const idempotency = await reserveIdempotencyKey(request, ctx);
  if (idempotency.kind === "replay") {
    return NextResponse.json(idempotency.response.body, {
      status: idempotency.response.status,
    });
  }
  const values = applicationCreateSchema.parse(
    await request.json().catch(() => null),
  );
  const application = await createApplicationForApi({
    workspaceId: ctx.workspaceId,
    jobId: values.jobId,
    candidateId: values.candidateId,
    source: values.source,
  });
  after(async () => {
    await Promise.allSettled([
      scheduleAutoScore(application.id, ctx.workspaceId),
      scheduleAutoDuplicateCheck(application.candidateId, ctx.workspaceId),
    ]);
  });
  const response = apiOk(serializeApplication(application), { status: 201 });
  if (idempotency.kind === "reserved") {
    await idempotency.complete({
      status: response.status,
      body: await response.clone().json(),
    });
  }
  return response;
});
