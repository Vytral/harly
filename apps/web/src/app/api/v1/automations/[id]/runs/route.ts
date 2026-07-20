import { listRuns, serializeRun } from "@/features/automations/data";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/automations/:id/runs — execution history for a workflow.
 * Query params: `limit` (1-100, default 50).
 */
export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "automations:read");
  const { id } = await (context as Context).params;
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  let limit = 50;
  if (limitParam) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      limit = 50;
    } else {
      limit = parsed;
    }
  }
  const runs = await listRuns({
    workspaceId: ctx.workspaceId,
    workflowId: id,
    limit,
  });
  return apiOk(runs.map(serializeRun));
});
