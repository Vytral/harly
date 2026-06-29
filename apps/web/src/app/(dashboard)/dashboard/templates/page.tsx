import { listEmailTemplates } from "@/features/email-templates/data";
import { TemplatesManager } from "@/features/email-templates/TemplatesManager";
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [templates, workspace] = await Promise.all([
    listEmailTemplates(),
    getWorkspaceContext(),
  ]);

  return (
    <TemplatesManager
      templates={templates}
      workspaceName={workspace.organization.name}
    />
  );
}
