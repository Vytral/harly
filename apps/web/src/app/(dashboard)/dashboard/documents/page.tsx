import { DocumentsHub } from "@/features/documents/DocumentsHub";
import { getDocumentHubData } from "@/features/documents/data";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  await requirePagePermission("documents:read");
  const data = await getDocumentHubData();
  return <DocumentsHub data={data} />;
}
