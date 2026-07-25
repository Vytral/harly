import { NextResponse } from "next/server";

import {
  createWorkflow,
  listWorkflows,
  serializeWorkflow,
} from "@/features/automations/data";
import { workflowInputSchema } from "@/features/automations/schema";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createAutomationContract,
  listAutomationsContract,
} from "@/server/api/contracts/automations";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(listAutomationsContract, async ({ auth }) => {
    const workflows = await listWorkflows(auth.workspaceId);
    return apiOk(workflows.map(serializeWorkflow));
  }),
);

export const POST = withApi(
  buildRouteHandler(
    createAutomationContract,
    async ({ body, auth, request }) => {
      const values = workflowInputSchema.parse(body);
      const idempotency = await reserveIdempotencyKey(request, auth);
      if (idempotency.kind === "replay") {
        return NextResponse.json(idempotency.response.body, {
          status: idempotency.response.status,
        });
      }
      const workflow = await createWorkflow({
        workspaceId: auth.workspaceId,
        values,
        createdById: auth.createdById ?? "",
      });
      const bodyJson = serializeWorkflow(workflow);
      const response = apiOk(bodyJson, { status: 201 });
      if (idempotency.kind === "reserved") {
        await idempotency.complete({ status: response.status, body: bodyJson });
      }
      return response;
    },
  ),
);
