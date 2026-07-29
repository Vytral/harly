import type { Route } from "next";
import { redirect } from "next/navigation";

import { DocumentsHub } from "@/features/documents/DocumentsHub";
import { getDocumentHubData } from "@/features/documents/data";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string; candidateId?: string }>;
}) {
  await requirePagePermission("documents:read");
  const { documentId, candidateId } = await searchParams;
  if (documentId) redirect(`/dashboard/documents/${documentId}` as Route);
  const data = await getDocumentHubData();
  return <DocumentsHub data={data} initialCandidateId={candidateId} />;
}
