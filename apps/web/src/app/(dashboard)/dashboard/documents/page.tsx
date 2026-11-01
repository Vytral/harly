import type { Route } from "next";
import { redirect } from "next/navigation";

import { DocumentsHub } from "@/features/documents/DocumentsHub";
import { getDocumentHubData } from "@/features/documents/data";
import { countWorkflowsUsingTemplates, listWorkflowDocumentTemplates } from "@/features/document-templates/data";
import { DocumentTemplatesManager } from "@/features/document-templates/DocumentTemplatesManager";
import { can, requireAnyPagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    documentId?: string;
    candidateId?: string;
    jobId?: string;
    view?: string;
    focus?: string;
    q?: string;
    category?: string;
    signature?: string;
    mine?: string;
    sort?: string;
  }>;
}) {
  await requireAnyPagePermission(["documents:read", "templates:manage"]);
  const [canReadDocuments, canManageTemplates] = await Promise.all([
    can("documents:read"),
    can("templates:manage"),
  ]);
  if (!canReadDocuments && !canManageTemplates) redirect("/dashboard" as Route);

  const { documentId, view, ...filters } = await searchParams;
  if (documentId) {
    if (!canReadDocuments) redirect("/dashboard/documents?view=templates" as Route);
    redirect(`/dashboard/documents/${documentId}` as Route);
  }
  if (view === "templates" || !canReadDocuments) {
    if (!canManageTemplates) redirect("/dashboard/documents" as Route);
    const templates = await listWorkflowDocumentTemplates();
    const usage = await countWorkflowsUsingTemplates(templates.map((template) => template.id));
    return (
      <DocumentTemplatesManager
        templates={templates}
        usage={usage}
        canReadDocuments={canReadDocuments}
        canGenerate={await can("documents:manage")}
      />
    );
  }

  const data = await getDocumentHubData();
  return (
    <DocumentsHub
      data={data}
      initialFilters={filters}
      canManageTemplates={canManageTemplates}
    />
  );
}
