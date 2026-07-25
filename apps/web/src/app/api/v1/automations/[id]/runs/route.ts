import { listRuns, serializeRun } from "@/features/automations/data";
import { buildRouteHandler } from "@/server/api/contracts";
import { listAutomationRunsContract } from "@/server/api/contracts/automations";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

/**
 * GET /api/v1/automations/:id/runs — execution history for a workflow.
 * Query params: `limit` (1-100, default 50).
 */
export const GET = withApi(
  buildRouteHandler(
    listAutomationRunsContract,
    async ({ params, query, auth }) => {
      const limit = (query as { limit?: number }).limit ?? 50;
      const runs = await listRuns({
        workspaceId: auth.workspaceId,
        workflowId: params.id,
        limit,
      });
      return apiOk(runs.map(serializeRun));
    },
  ),
);
