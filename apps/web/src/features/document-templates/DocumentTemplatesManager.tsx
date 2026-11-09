"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Copy,
  FileText,
  FilePlus2,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/status-pill";
import { toast } from "@/lib/notification-island/toast";
import { DocumentsWorkspaceTabs } from "@/features/documents/DocumentsWorkspaceTabs";
import { formatDate } from "@/features/documents/DocumentShared";
import { GenerateDocumentDialog } from "@/features/documents/GenerateDocumentDialog";

import {
  archiveWorkflowDocumentTemplate,
  duplicateWorkflowDocumentTemplate,
  restoreWorkflowDocumentTemplate,
} from "./actions";
import { TEMPLATE_LIST_GRID, type WorkflowDocumentTemplateItem } from "./shared";

export function DocumentTemplatesManager({
  templates,
  usage = {},
  canReadDocuments,
  canGenerate = false,
}: {
  templates: WorkflowDocumentTemplateItem[];
  /** Workflows referencing each template id. */
  usage?: Record<string, number>;
  canReadDocuments: boolean;
  canGenerate?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("features.documentTemplates.documentTemplatesManager");
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [generateFor, setGenerateFor] = useState<string | null>(null);
  const active = templates.filter((template) => !template.archivedAt);
  const archived = templates.filter((template) => template.archivedAt);

  async function archive(template: WorkflowDocumentTemplateItem) {
    const used = usage[template.id] ?? 0;
    if (
      !(await confirm({
        tone: "warning",
        title: t("archiveTitle", { name: template.name }),
        description: used > 0 ? t("archiveInUse", { count: used }) : t("archiveUnused"),
        confirmLabel: t("archiveConfirm"),
      }))
    )
      return;
    run(() => archiveWorkflowDocumentTemplate({ templateId: template.id }), t("templateArchived"));
  }

  function run(
    action: () => Promise<{ success: boolean; error?: string; id?: string }>,
    success: string,
    after?: (id: string | undefined) => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? t("somethingWentWrong"));
        return;
      }
      toast.success(success);
      after?.(result.id);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <DocumentsWorkspaceTabs active="templates" canReadDocuments={canReadDocuments} canManageTemplates />
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild>
            <Link href={"/dashboard/documents/templates/new" as Route}>
              <Plus className="size-4" /> {t("newTemplate")}
            </Link>
          </Button>
        }
      />

      {active.length === 0 ? (
        <div className="flex flex-col items-center rounded-[var(--radius-card)] bg-lime-wash px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-[var(--radius-btn)] bg-pure-snow text-near-ink">
            <FileText className="size-6" />
          </span>
          <h2 className="mt-4 text-[15px] font-semibold tracking-[-0.01em] text-near-ink">{t("emptyTitle")}</h2>
          <p className="mt-1 max-w-md text-sm text-soft-ink">{t("emptyDescription")}</p>
          <Button asChild className="mt-5">
            <Link href={"/dashboard/documents/templates/new" as Route}>
              <Plus className="size-4" /> {t("createTemplate")}
            </Link>
          </Button>
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <div className={`hidden gap-4 border-b border-hairline px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-soft-ink md:grid ${TEMPLATE_LIST_GRID}`}>
            <span>{t("columnName")}</span>
            <span>{t("columnPdfTitle")}</span>
            <span>{t("columnUsedBy")}</span>
            <span>{t("columnUpdated")}</span>
            <span />
          </div>
          <ul className="divide-y divide-hairline">
            {active.map((template) => {
              const used = usage[template.id] ?? 0;
              return (
                <li
                  key={template.id}
                  className={`relative grid grid-cols-1 gap-1 px-4 py-3.5 transition-colors hover:bg-row-wash md:items-center md:gap-4 ${TEMPLATE_LIST_GRID}`}
                >
                  <Link
                    href={`/dashboard/documents/templates/${template.id}` as Route}
                    className="flex min-w-0 items-center gap-3 pr-10 outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-near-ink md:pr-0"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
                      <FileText className="size-4" />
                    </span>
                    <span className="min-w-0 truncate text-sm font-semibold text-near-ink">{template.name}</span>
                  </Link>
                  <span className="truncate pl-12 text-[13px] text-soft-ink md:pl-0">{template.title}</span>
                  <span>
                    <span className="pl-12 md:pl-0">
                      {used > 0 ? (
                        <StatusPill size="sm" tone="info">
                          {t("usedByCount", { count: used })}
                        </StatusPill>
                      ) : (
                        <span className="text-xs text-quiet-mist">{t("notUsed")}</span>
                      )}
                    </span>
                  </span>
                  <span className="pl-12 text-xs text-soft-ink md:pl-0">{formatDate(template.updatedAt.toISOString())}</span>
                  <span className="absolute top-3 right-3 z-10 md:static">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={t("actionsFor", { name: template.name })}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {canGenerate ? (
                          <DropdownMenuItem onSelect={() => setGenerateFor(template.id)}>
                            <FilePlus2 />
                            {t("generateDocument")}
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/documents/templates/${template.id}` as Route}>
                            <Pencil />
                            {t("edit")}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            run(
                              () => duplicateWorkflowDocumentTemplate({ templateId: template.id }),
                              t("templateDuplicated"),
                              (id) => id && router.push(`/dashboard/documents/templates/${id}` as Route),
                            )
                          }
                        >
                          <Copy />
                          {t("duplicate")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void archive(template)}>
                          <Archive />
                          {t("archive")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {archived.length > 0 ? (
        <details className="group rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium text-near-ink [&::-webkit-details-marker]:hidden">
            {t("archivedTemplates", { count: archived.length })}
            <ChevronDown className="size-4 text-soft-ink transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y divide-hairline border-t border-hairline">
            {archived.map((template) => (
              <li key={template.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-near-ink">{template.name}</p>
                  <p className="text-xs text-soft-ink">
                    {t("archivedOn", {
                      date: template.archivedAt ? formatDate(template.archivedAt.toISOString()) : "",
                    })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => restoreWorkflowDocumentTemplate({ templateId: template.id }), t("templateRestored"))}
                >
                  <ArchiveRestore />
                  {t("restore")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <GenerateDocumentDialog
        key={generateFor ?? "none"}
        open={generateFor !== null}
        onOpenChange={(open) => !open && setGenerateFor(null)}
        defaultTemplateId={generateFor ?? undefined}
      />
    </div>
  );
}
