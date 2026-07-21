import { notFound } from "next/navigation";

import { getBuilderData } from "@/features/automations/builder-data";
import { WorkflowBuilder } from "@/features/automations/builder/WorkflowBuilder";
import { getWorkflow, serializeWorkflow } from "@/features/automations/data";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

/**
 * The workflow builder — a full-page focus-mode editor (same (fullscreen)
 * route group as the career page builder). `id === "new"` starts a blank
 * draft; otherwise the existing workflow is loaded and handed to the client
 * builder. Gated by automations:manage.
 *
 * `params` is a Promise in Next 16 (async dynamic params) — awaited before use.
 */
export default async function WorkflowBuilderRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization } = await requirePagePermission("automations:manage");

  const [builderData, workflow] = await Promise.all([
    getBuilderData(),
    id === "new" ? Promise.resolve(null) : getWorkflow({ workspaceId: organization.id, id }),
  ]);

  if (id !== "new" && !workflow) notFound();

  return (
    <WorkflowBuilder
      initial={workflow ? serializeWorkflow(workflow) : null}
      builderData={builderData}
      isNew={id === "new"}
    />
  );
}
