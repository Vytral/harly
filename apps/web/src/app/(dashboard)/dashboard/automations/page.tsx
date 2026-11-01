import { eq } from "drizzle-orm";

import { isDemoMode } from "@harly/config";
import { db, user } from "@harly/db";
import { AutomationsManager } from "@/features/automations/AutomationsManager";
import { AutomationsDemo } from "@/features/automations/AutomationsDemo";
import {
  listPendingWorkflowApprovals,
  listWorkflows,
  getWorkspaceAutomationPolicy,
  serializeWorkflow,
} from "@/features/automations/data";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { WorkspaceAutomationControls } from "@/features/automations/WorkspaceAutomationControls";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  if (isDemoMode()) {
    return <AutomationsDemo />;
  }

  const workspace = await requirePagePermission("automations:manage");
  const workflows = await listWorkflows(workspace.organization.id);
  const policy = await getWorkspaceAutomationPolicy(workspace.organization.id);
  const approvals = await listPendingWorkflowApprovals({
    workspaceId: workspace.organization.id,
    actorId: workspace.user.id,
  });

  const [pausedBy] =
    !policy.enabled && policy.pausedById
      ? await db.select({ name: user.name }).from(user).where(eq(user.id, policy.pausedById)).limit(1)
      : [];

  return (
    <>
      {/* The workspace switch only matters once there is something to pause,
          or while everything is paused. */}
      {workflows.length > 0 || !policy.enabled ? (
        <WorkspaceAutomationControls initialPolicy={policy} pausedByName={pausedBy?.name ?? null} />
      ) : null}
      <AutomationsManager
        initialWorkflows={workflows.map(serializeWorkflow)}
        initialApprovals={approvals}
      />
    </>
  );
}
