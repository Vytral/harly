import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DocumentTemplateEditorRoute({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  redirect(`/dashboard/documents/templates/${templateId}`);
}
