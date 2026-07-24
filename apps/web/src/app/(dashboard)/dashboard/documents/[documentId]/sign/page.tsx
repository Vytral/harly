import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { NativeSignWorkspace } from "@/features/documents/NativeSignWorkspace";
import { getDocumentAccess } from "@/features/documents/data";

export const dynamic = "force-dynamic";

export default async function NativeSignPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const access = await getDocumentAccess(documentId);
  if (!access || access.level !== "manage") notFound();
  if (access.document.status !== "active" || access.document.signatureStatus !== "unsigned" || access.document.mimeType !== "application/pdf") {
    redirect(`/dashboard/documents/${documentId}` as Route);
  }
  return <NativeSignWorkspace documentId={access.document.id} documentName={access.document.name} />;
}
