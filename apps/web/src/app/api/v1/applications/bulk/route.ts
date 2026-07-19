import { after } from "next/server";
import { NextResponse } from "next/server";

import {
  createApplicationsBulkForApi,
  serializeApplication,
} from "@/features/applications/service";
import { scheduleAutoDuplicateCheck } from "@/features/applications/auto-duplicates";
import { scheduleAutoScore } from "@/features/applications/auto-score";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { applicationBulkCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/v1/applications/bulk , create up to 100 applications independently. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "applications:write");
  const idempotency = await reserveIdempotencyKey(request, ctx);
  if (idempotency.kind === "replay") {
    return NextResponse.json(idempotency.response.body, {
      status: idempotency.response.status,
    });
  }

  const values = applicationBulkCreateSchema.parse(
    await request.json().catch(() => null),
  );
  const items = await createApplicationsBulkForApi({
    workspaceId: ctx.workspaceId,
    ...values,
  });
  const body = {
    items: items.map((item) =>
      item.outcome === "created"
        ? {
            candidateId: item.candidateId,
            outcome: item.outcome,
            application: serializeApplication(item.application),
          }
        : item,
    ),
    summary: {
      created: items.filter((item) => item.outcome === "created").length,
      conflicts: items.filter((item) => item.outcome === "conflict").length,
      failed: items.filter((item) => item.outcome === "failed").length,
    },
  };

  after(async () => {
    await Promise.allSettled(
      items.flatMap((item) =>
        item.outcome === "created"
          ? [
              scheduleAutoScore(item.application.id, ctx.workspaceId),
              scheduleAutoDuplicateCheck(
                item.application.candidateId,
                ctx.workspaceId,
              ),
            ]
          : [],
      ),
    );
  });

  const status = body.summary.created === items.length ? 201 : 200;
  const response = apiOk(body, { status });
  if (idempotency.kind === "reserved") {
    await idempotency.complete({
      status: response.status,
      body: await response.clone().json(),
    });
  }
  return response;
});
