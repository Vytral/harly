import { AutomationsManager } from "@/features/automations/AutomationsManager";
import { listWorkflows, serializeWorkflow } from "@/features/automations/data";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const workspace = await requirePagePermission("automations:manage");
  const workflows = await listWorkflows(workspace.organization.id);

  return (
    <AutomationsManager initialWorkflows={workflows.map(serializeWorkflow)} />
  );
}
