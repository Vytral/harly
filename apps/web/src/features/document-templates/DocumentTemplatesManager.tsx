"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FileText, Plus, Archive, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/lib/notification-island/toast";
import { DocumentsWorkspaceTabs } from "@/features/documents/DocumentsWorkspaceTabs";

import { archiveWorkflowDocumentTemplate } from "./actions";
import type { WorkflowDocumentTemplateItem } from "./shared";

function previewBody(value: string) {
  return value
    .replace(/<br\s*\/?>(\s*)/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function DocumentTemplatesManager({
  templates,
  canReadDocuments,
}: {
  templates: WorkflowDocumentTemplateItem[];
  canReadDocuments: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = templates.filter((template) => !template.archivedAt);
  const archived = templates.filter((template) => template.archivedAt);

  function archive(template: WorkflowDocumentTemplateItem) {
    if (!window.confirm(`Archive the “${template.name}” document template? Published workflows keep their snapshot.`)) return;
    startTransition(async () => {
      const result = await archiveWorkflowDocumentTemplate({ templateId: template.id });
      if (!result.success) {
        toast.error(result.error ?? "Could not archive the document template.");
        return;
      }
      toast.success("Document template archived.");
      router.refresh();
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 sm:px-8 lg:px-10">
      <DocumentsWorkspaceTabs
        active="templates"
        canReadDocuments={canReadDocuments}
        canManageTemplates
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflow document templates</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Reusable, variable-filled documents for automation workflows. Published workflows keep their own content snapshot, while generated PDFs appear in your document library.
          </p>
        </div>
        <Button asChild>
          <Link href={"/dashboard/documents/templates/new" as Route}><Plus className="size-4" /> New workflow template</Link>
        </Button>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"><FileText className="size-6" /></span>
          <h2 className="mt-4 text-base font-semibold">Create your first reusable document</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Use it for offers, agreements, onboarding packets or any PDF you want Harly to generate and send for signature.</p>
          <Button asChild className="mt-5"><Link href={"/dashboard/documents/templates/new" as Route}><Plus className="size-4" /> Create template</Link></Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {active.map((template) => (
            <Card key={template.id}>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{template.name}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{template.title}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" asChild aria-label={`Edit ${template.name}`}>
                      <Link href={`/dashboard/documents/templates/${template.id}` as Route}><Pencil className="size-4" /></Link>
                    </Button>
                    <Button size="icon" variant="ghost" disabled={pending} onClick={() => archive(template)} aria-label={`Archive ${template.name}`}>
                      <Archive className="size-4" />
                    </Button>
                  </div>
                </div>
                <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{previewBody(template.body)}</p>
                <p className="text-[11px] text-muted-foreground">Updated {template.updatedAt.toLocaleDateString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {archived.length > 0 ? (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">Archived templates ({archived.length})</summary>
          <div className="mt-4 space-y-2">
            {archived.map((template) => <p key={template.id} className="text-sm text-muted-foreground">{template.name} · archived</p>)}
          </div>
        </details>
      ) : null}
    </main>
  );
}
