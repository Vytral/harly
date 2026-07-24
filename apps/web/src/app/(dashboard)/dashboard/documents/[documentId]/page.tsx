import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DocumentDetailView } from "@/features/documents/DocumentDetailView";
import { getDocumentHubData } from "@/features/documents/data";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  await requirePagePermission("documents:read");
  const { documentId } = await params;
  const data = await getDocumentHubData();
  const document = data.documents.find((item) => item.id === documentId);
  if (!document) notFound();

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 duration-500 animate-in fade-in slide-in-from-bottom-1">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/dashboard/documents">
          <ArrowLeft className="size-4" />
          Back to documents
        </Link>
      </Button>
      <DocumentDetailView data={data} document={document} />
    </div>
  );
}
