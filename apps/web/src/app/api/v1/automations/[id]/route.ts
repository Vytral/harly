import {
  deleteWorkflow,
  getWorkflow,
  serializeWorkflow,
  updateWorkflow,
} from "@/features/automations/data";
import { workflowInputSchema } from "@/features/automations/schema";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  deleteAutomationByIdContract,
  getAutomationByIdContract,
  updateAutomationByIdContract,
} from "@/server/api/contracts/automations";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(getAutomationByIdContract, async ({ params, auth }) => {
    const workflow = await getWorkflow({
      workspaceId: auth.workspaceId,
      id: params.id,
    });
    return apiOk(serializeWorkflow(workflow));
  }),
);

/** PATCH /api/v1/automations/:id — partial update (name, enabled, trigger, ...). */
export const PATCH = withApi(
  buildRouteHandler(
    updateAutomationByIdContract,
    async ({ params, body, auth }) => {
      const patch = workflowInputSchema.partial().parse(body);
      const workflow = await updateWorkflow({
        workspaceId: auth.workspaceId,
        id: params.id,
        patch,
      });
      return apiOk(serializeWorkflow(workflow));
    },
  ),
);

/** DELETE /api/v1/automations/:id — remove a workflow (cascades to runs). */
export const DELETE = withApi(
  buildRouteHandler(deleteAutomationByIdContract, async ({ params, auth }) => {
    await deleteWorkflow({ workspaceId: auth.workspaceId, id: params.id });
    return apiOk({ deleted: true });
  }),
);
