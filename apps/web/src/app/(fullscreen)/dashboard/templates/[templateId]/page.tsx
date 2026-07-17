import { notFound } from "next/navigation";

import { getEmailTemplate } from "@/features/email-templates/data";
import { TemplateEditorPage } from "@/features/email-templates/TemplateEditorPage";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function TemplateEditorRoute({ params }: { params: Promise<{ templateId: string }> }) {
  const [{ templateId }, workspace] = await Promise.all([params, requirePagePermission("templates:manage")]);
  const template = templateId === "new" ? null : await getEmailTemplate(templateId);
  if (templateId !== "new" && !template) notFound();
  return <TemplateEditorPage template={template} workspaceName={workspace.organization.name} />;
}
