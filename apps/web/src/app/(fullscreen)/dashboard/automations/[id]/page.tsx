import { notFound, redirect } from "next/navigation";
import { isDemoMode } from "@harly/config";

import { getBuilderData } from "@/features/automations/builder-data";
import { WorkflowBuilder } from "@/features/automations/builder/WorkflowBuilder";
import { getWorkflow, serializeWorkflow } from "@/features/automations/data";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function WorkflowBuilderRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (isDemoMode()) {
    redirect("/dashboard/automations");
  }

  const [{ id }, workspace] = await Promise.all([
    params,
    requirePagePermission("automations:manage"),
  ]);

  const isNew = id === "new";
  const [initial, builderData] = await Promise.all([
    isNew
      ? Promise.resolve(null)
      : getWorkflow({ workspaceId: workspace.organization.id, id })
          .then(serializeWorkflow)
          .catch(() => null),
    getBuilderData(isNew ? undefined : id),
  ]);

  if (!isNew && !initial) notFound();

  return <WorkflowBuilder initial={initial} builderData={builderData} isNew={isNew} />;
}
