import type { Route } from "next";
import { redirect } from "next/navigation";

import { DocumentsHub } from "@/features/documents/DocumentsHub";
import { getDocumentHubData } from "@/features/documents/data";
import { listWorkflowDocumentTemplates } from "@/features/document-templates/data";
import { DocumentTemplatesManager } from "@/features/document-templates/DocumentTemplatesManager";
import { can } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    documentId?: string;
    candidateId?: string;
    view?: string;
  }>;
}) {
  const [canReadDocuments, canManageTemplates] = await Promise.all([
    can("documents:read"),
    can("templates:manage"),
  ]);
  if (!canReadDocuments && !canManageTemplates) redirect("/dashboard" as Route);

  const { documentId, candidateId, view } = await searchParams;
  if (documentId) {
    if (!canReadDocuments) redirect("/dashboard/documents?view=templates" as Route);
    redirect(`/dashboard/documents/${documentId}` as Route);
  }
  if (view === "templates" || !canReadDocuments) {
    if (!canManageTemplates) redirect("/dashboard/documents" as Route);
    const templates = await listWorkflowDocumentTemplates();
    return (
      <DocumentTemplatesManager
        templates={templates}
        canReadDocuments={canReadDocuments}
      />
    );
  }

  const data = await getDocumentHubData();
  return (
    <DocumentsHub
      data={data}
      initialCandidateId={candidateId}
      canManageTemplates={canManageTemplates}
    />
  );
}
