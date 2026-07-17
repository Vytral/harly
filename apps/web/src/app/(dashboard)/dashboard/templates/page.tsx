import { listEmailTemplates } from "@/features/email-templates/data";
import { TemplatesManager } from "@/features/email-templates/TemplatesManager";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const workspace = await requirePagePermission("templates:manage");
  const templates = await listEmailTemplates();

  return (
    <TemplatesManager
      templates={templates}
      workspaceName={workspace.organization.name}
    />
  );
}
