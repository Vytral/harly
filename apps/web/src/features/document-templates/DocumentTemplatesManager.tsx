"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FileText, Plus, Archive, Pencil, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const active = templates.filter((template) => !template.archivedAt);
  const archived = templates.filter((template) => template.archivedAt);

  async function archive(template: WorkflowDocumentTemplateItem) {
    if (
      !(await confirm({
        tone: "warning",
        title: `Archive the “${template.name}” template?`,
        description: "Published workflows keep their snapshot. New workflows can no longer use it.",
        confirmLabel: "Archive template",
      }))
    )
      return;
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
    <main className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:px-8 lg:px-10">
      <DocumentsWorkspaceTabs
        active="templates"
        canReadDocuments={canReadDocuments}
        canManageTemplates
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight text-near-ink">Workflow document templates</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-soft-ink">
            Reusable, variable-filled documents for automation workflows. Published workflows keep their own content snapshot, while generated PDFs appear in your document library.
          </p>
        </div>
        <Button asChild>
          <Link href={"/dashboard/documents/templates/new" as Route}><Plus className="size-4" /> New workflow template</Link>
        </Button>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center rounded-[var(--radius-card)] bg-lime-wash px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-[var(--radius-btn)] bg-pure-snow text-near-ink"><FileText className="size-6" /></span>
          <h2 className="mt-4 text-[15px] font-semibold tracking-[-0.01em] text-near-ink">Create your first reusable document</h2>
          <p className="mt-1 max-w-md text-sm text-soft-ink">Use it for offers, agreements, onboarding packets or any PDF you want Harly to generate and send for signature.</p>
          <Button asChild className="mt-5"><Link href={"/dashboard/documents/templates/new" as Route}><Plus className="size-4" /> Create template</Link></Button>
        </div>
      ) : (
        <Card className="gap-0 divide-y divide-hairline overflow-hidden py-0">
          {active.map((template) => (
            <div key={template.id} className="group flex items-center gap-3 px-4 py-4 transition-colors hover:bg-row-wash">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
                <FileText className="size-4" />
              </span>
              <Link
                href={`/dashboard/documents/templates/${template.id}` as Route}
                className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
              >
                <p className="truncate text-sm font-semibold text-near-ink">{template.name}</p>
                <p className="mt-0.5 truncate text-[13px] text-soft-ink">{template.title}</p>
                <p className="mt-0.5 line-clamp-1 text-[13px] text-soft-ink">{previewBody(template.body)}</p>
                <p className="mt-1 text-xs text-quiet-mist">Updated {template.updatedAt.toLocaleDateString()}</p>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="icon" variant="ghost" asChild aria-label={`Edit ${template.name}`}>
                  <Link href={`/dashboard/documents/templates/${template.id}` as Route}><Pencil className="size-4" /></Link>
                </Button>
                <Button size="icon" variant="ghost" disabled={pending} onClick={() => archive(template)} aria-label={`Archive ${template.name}`}>
                  <Archive className="size-4" />
                </Button>
                <ChevronRight aria-hidden className="size-4 text-quiet-mist" />
              </div>
            </div>
          ))}
        </Card>
      )}

      {archived.length > 0 ? (
        <details className="rounded-[var(--radius-card)] bg-card p-4 shadow-[var(--shadow-card)]">
          <summary className="cursor-pointer text-sm font-medium text-near-ink">Archived templates ({archived.length})</summary>
          <div className="mt-4 space-y-2">
            {archived.map((template) => <p key={template.id} className="text-sm text-soft-ink">{template.name} · archived</p>)}
          </div>
        </details>
      ) : null}
    </main>
  );
}
