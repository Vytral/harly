import {
  deleteWorkflow,
  getWorkflow,
  serializeWorkflow,
  updateWorkflow,
} from "@/features/automations/data";
import { workflowInputSchema } from "@/features/automations/schema";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** GET /api/v1/automations/:id — fetch a single workflow. */
export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "automations:read");
  const { id } = await (context as Context).params;
  const workflow = await getWorkflow({ workspaceId: ctx.workspaceId, id });
  return apiOk(serializeWorkflow(workflow));
});

/** PATCH /api/v1/automations/:id — partial update (name, enabled, trigger, ...). */
export const PATCH = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "automations:write");
  const { id } = await (context as Context).params;
  // Validate the partial body against the full input schema (each field is
  // optional there); the data layer re-validates individual fields too.
  const patch = workflowInputSchema.partial().parse(
    await request.clone().json().catch(() => null),
  );
  const workflow = await updateWorkflow({
    workspaceId: ctx.workspaceId,
    id,
    patch,
  });
  return apiOk(serializeWorkflow(workflow));
});

/** DELETE /api/v1/automations/:id — remove a workflow (cascades to runs). */
export const DELETE = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "automations:write");
  const { id } = await (context as Context).params;
  await deleteWorkflow({ workspaceId: ctx.workspaceId, id });
  return apiOk({ deleted: true });
});
