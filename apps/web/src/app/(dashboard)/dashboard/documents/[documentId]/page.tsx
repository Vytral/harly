import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, workspaceSettings } from "@harly/db";

import { DocumentDetailView } from "@/features/documents/DocumentDetailView";
import { getDocumentDetail } from "@/features/documents/data";
import { getDocumentSignatureTimeline } from "@/features/documents/native-signature-actions";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  await requirePagePermission("documents:read");
  const { documentId } = await params;
  const [bundle, context] = await Promise.all([getDocumentDetail(documentId), getWorkspaceContext()]);
  if (!bundle) notFound();
  // Settings > Signature > "Signing timeline" turns on the readable history.
  const [settings] = await db
    .select({ timelineEnabled: workspaceSettings.signatureTimelineEnabled })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, context.organization.id))
    .limit(1);
  const signatureTimeline = settings?.timelineEnabled
    ? await getDocumentSignatureTimeline(documentId)
    : null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <DocumentDetailView bundle={bundle} signatureTimeline={signatureTimeline} />
    </div>
  );
}
