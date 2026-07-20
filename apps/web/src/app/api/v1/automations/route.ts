import { NextResponse } from "next/server";

import {
  createWorkflow,
  listWorkflows,
  serializeWorkflow,
} from "@/features/automations/data";
import { workflowInputSchema } from "@/features/automations/schema";
import { authenticateApiKey } from "@/server/api/auth";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

/** GET /api/v1/automations — list workflows for the authenticated workspace. */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "automations:read");
  const workflows = await listWorkflows(ctx.workspaceId);
  return apiOk(workflows.map(serializeWorkflow));
});

/** POST /api/v1/automations — create a workflow. Idempotent via Idempotency-Key. */
export const POST = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "automations:write");
  const values = workflowInputSchema.parse(
    await request.clone().json().catch(() => null),
  );
  const idempotency = await reserveIdempotencyKey(request, ctx);
  if (idempotency.kind === "replay") {
    return NextResponse.json(idempotency.response.body, {
      status: idempotency.response.status,
    });
  }
  const workflow = await createWorkflow({
    workspaceId: ctx.workspaceId,
    values,
    // API-created workflows run as the key's creator (decision D1).
    createdById: ctx.createdById ?? "",
  });
  const response = apiOk(serializeWorkflow(workflow), { status: 201 });
  if (idempotency.kind === "reserved") {
    await idempotency.complete({
      status: response.status,
      body: { data: serializeWorkflow(workflow) },
    });
  }
  return response;
});
