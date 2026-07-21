import { listWorkflows, serializeWorkflow } from "@/features/automations/data";
import { AutomationsManager } from "@/features/automations/AutomationsManager";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

/**
 * Automations index. Gated by automations:manage (defense in depth on top of
 * the per-action requirePermission checks). Loads the workspace's workflows
 * server-side and hands the serialized list to the client manager.
 */
export default async function AutomationsPage() {
  const { organization } = await requirePagePermission("automations:manage");
  const workflows = await listWorkflows(organization.id);

  return <AutomationsManager initialWorkflows={workflows.map(serializeWorkflow)} />;
}
