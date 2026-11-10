"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { toast } from "@/lib/notification-island/toast";

import { cn } from "@/lib/utils";
import { RelativeTime } from "@/lib/date-hydration";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  CaretRightIcon,
  PlusIcon,
  TrashIcon,
  LightningIcon,
  MagicWandDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import {
  createWorkflowFromTemplateAction,
  deleteWorkflowAction,
  toggleWorkflowAction,
} from "./actions";
import { templateCopy, WORKFLOW_TEMPLATES, type WorkflowTemplate } from "./builder/templates";
import { describeGraphWorkflow, describeWorkflow, graphActionCount } from "./builder/preview";
import { triggerMeta } from "./builder/catalog";
import type { SerializedWorkflow } from "./builder/types";
import { restoreAtIndex } from "./list-restore";
import { PendingApprovalsPanel } from "./PendingApprovalsPanel";
import type { PendingWorkflowApproval } from "./data";

export function AutomationsManager({
  initialWorkflows,
  initialApprovals,
}: {
  initialWorkflows: SerializedWorkflow[];
  initialApprovals: PendingWorkflowApproval[];
}) {
  const t = useTranslations("features.automations.AutomationsManager");
  const tl = useTranslations("labels.automations");
  const searchParams = useSearchParams();
  const wantsRecipes = searchParams.get("recipes") === "1";
  const [workflows, setWorkflows] = useState(initialWorkflows);
  // `?recipes=1` (the onboarding checklist link) opens the recipes picker.
  const [showTemplates, setShowTemplates] = useState(wantsRecipes);
  // Re-open when the link is followed while this page is already mounted.
  // Adjusting state during render avoids an effect that sets state.
  const [seenWantsRecipes, setSeenWantsRecipes] = useState(wantsRecipes);
  if (wantsRecipes !== seenWantsRecipes) {
    setSeenWantsRecipes(wantsRecipes);
    if (wantsRecipes) setShowTemplates(true);
  }
  const [pending, startTransition] = useTransition();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    index: number;
    name: string;
  } | null>(null);

  const isEmpty = workflows.length === 0;

  function toggle(id: string, enabled: boolean, i: number) {
    setWorkflows((prev) =>
      prev.map((w, j) =>
        j === i ? { ...w, enabled, status: enabled ? "published" : "paused" } : w,
      ),
    );
    startTransition(async () => {
      const r = await toggleWorkflowAction(id, enabled);
      if (!r.ok) {
        setWorkflows((prev) =>
          prev.map((w, j) =>
            j === i
              ? { ...w, enabled: !enabled, status: enabled ? "paused" : "published" }
              : w,
          ),
        );
        toast.error(r.error ?? t("toggleError"));
      }
    });
  }

  function confirmRemove() {
    if (!pendingDelete) return;
    const { id, index } = pendingDelete;
    const removed = workflows[index];
    setPendingDelete(null);
    if (!removed) return;
    setWorkflows((prev) => prev.filter((_, j) => j !== index));
    startTransition(async () => {
      const r = await deleteWorkflowAction(id);
      if (!r.ok) {
        setWorkflows((prev) => restoreAtIndex(prev, index, removed));
        toast.error(r.error ?? t("deleteError"));
      } else {
        toast.success(t("deletedToast"));
      }
    });
  }

  function fromTemplate(template: WorkflowTemplate) {
    startTransition(async () => {
      const r = await createWorkflowFromTemplateAction(template.build());
      if (r.ok && r.workflow) {
        toast.success(t("createdToast", { name: templateCopy(template, tl).name }));
        window.location.href = `/dashboard/automations/${r.workflow.id}` as Route;
      } else {
        toast.error(r.error ?? t("templateError"));
      }
    });
  }

  if (isEmpty && !showTemplates) {
    return <EmptyState onShowTemplates={() => setShowTemplates(true)} />;
  }

  return (
    <div className="w-full">
      <Header
        count={workflows.length}
        onCreate={() => setShowTemplates(true)}
      />

      <PendingApprovalsPanel initialApprovals={initialApprovals} />

      {showTemplates && (
        <TemplateGallery
          onPick={fromTemplate}
          onClose={() => setShowTemplates(false)}
          pending={pending}
        />
      )}

      <Card className="mt-6 gap-0 divide-y divide-hairline overflow-hidden py-0">
        {workflows.map((w, i) => (
          <WorkflowCard
            key={w.id}
            workflow={w}
            onToggle={(enabled) => toggle(w.id, enabled, i)}
            onDelete={() =>
              setPendingDelete({ id: w.id, index: i, name: w.name })
            }
            disabled={pending}
          />
        ))}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        tone="destructive"
        title={t("deleteTitle")}
        description={
          pendingDelete
            ? t("deleteDescription", { name: pendingDelete.name })
            : t("cannotBeUndone")
        }
        confirmLabel={t("deleteConfirm")}
        cancelLabel={t("keepIt")}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

function Header({ count, onCreate }: { count: number; onCreate: () => void }) {
  const t = useTranslations("features.automations.AutomationsManager");
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-near-ink">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-soft-ink">
          {t("countSummary", { count })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline">
          <Link href={"/dashboard/automations/new" as Route}>
            <PlusIcon className="size-4" /> {t("startFromScratch")}
          </Link>
        </Button>
        <Button type="button" onClick={onCreate}>
          <MagicWandDuotoneIcon className="size-4" /> {t("templates")}
        </Button>
      </div>
    </div>
  );
}

function WorkflowCard({
  workflow,
  onToggle,
  onDelete,
  disabled,
}: {
  workflow: SerializedWorkflow;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("features.automations.AutomationsManager");
  const tl = useTranslations("labels.automations");
  const meta = triggerMeta(workflow.trigger.event, tl);
  const graph = workflow.engineVersion === 2 ? workflow.graph : undefined;
  const nl = graph
    ? describeGraphWorkflow(graph, tl)
    : describeWorkflow(
        {
          trigger: workflow.trigger,
          conditions: workflow.conditions,
          actions: workflow.actions,
        },
        tl,
      );
  const actionCount = graph ? graphActionCount(graph) : workflow.actions.length;
  const canToggle = workflow.status === "published" || workflow.status === "paused";

  const statusLabel = workflow.hasUnpublishedChanges
    ? t("status.editsPending")
    : workflow.status === "published"
      ? t("status.on")
      : workflow.status === "paused"
        ? t("status.paused")
        : t("status.draft");

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-4 transition-colors hover:bg-row-wash",
        !workflow.enabled && "opacity-70",
      )}
    >
      <Link
        href={`/dashboard/automations/${workflow.id}` as Route}
        className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
      >
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-[var(--radius-btn)] border transition-colors",
            workflow.enabled
              ? "border-transparent bg-chartreuse-signal text-chartreuse-ink"
              : "border-hairline bg-pure-snow text-soft-ink",
          )}
        >
          <LightningIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-near-ink">{workflow.name}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-kraft px-2 py-0.5 text-[11px] font-medium text-near-ink">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  workflow.status === "published" ? "bg-success-olive" : "bg-quiet-mist",
                )}
              />
              {statusLabel}
            </span>
          </span>
          <span className="mt-0.5 line-clamp-1 block text-[13px] text-soft-ink">{nl}</span>
          <span className="mt-1 block text-xs text-quiet-mist">
            {t.rich("workflowMeta", {
              trigger: meta.label,
              count: actionCount,
              edited: (chunks) => (
                <>
                  {chunks} <RelativeTime value={workflow.updatedAt} />
                </>
              ),
            })}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label={t("deleteLabel", { name: workflow.name })}
        className="inline-flex size-8 items-center justify-center rounded-full text-soft-ink transition-colors hover:bg-soft-kraft hover:text-danger-rust focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink disabled:opacity-50"
      >
        <TrashIcon className="size-4" />
      </button>
      <Switch
        checked={workflow.enabled}
        onCheckedChange={onToggle}
        disabled={disabled || !canToggle}
        aria-label={workflow.enabled ? t("disableLabel") : t("enableLabel")}
      />
      <CaretRightIcon aria-hidden className="size-4 shrink-0 text-quiet-mist" />
    </div>
  );
}

function EmptyState({ onShowTemplates }: { onShowTemplates: () => void }) {
  const t = useTranslations("features.automations.AutomationsManager");
  const choice =
    "group flex w-full items-center gap-4 rounded-[var(--radius-card)] bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink";
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-6">
      <div className="flex items-start gap-4 rounded-[var(--radius-card)] bg-lime-wash p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-btn)] bg-pure-snow text-near-ink">
          <MagicWandDuotoneIcon className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-xl text-near-ink">
            {t("emptyTitle")}
          </h1>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-soft-ink">
            {t.rich("emptyBody", {
              b: (chunks) => (
                <strong className="font-medium text-near-ink">{chunks}</strong>
              ),
            })}
          </p>
        </div>
      </div>
      <button type="button" onClick={onShowTemplates} className={choice}>
        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
          <MagicWandDuotoneIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-near-ink">{t("chooseTemplate")}</span>
          <span className="mt-0.5 block text-[13px] text-soft-ink">{t("chooseTemplateHint")}</span>
        </span>
        <CaretRightIcon aria-hidden className="size-4 shrink-0 text-quiet-mist transition-transform group-hover:translate-x-0.5" />
      </button>
      <Link href={"/dashboard/automations/new" as Route} className={choice}>
        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
          <PlusIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-near-ink">{t("startFromScratch")}</span>
          <span className="mt-0.5 block text-[13px] text-soft-ink">{t("buildOwnHint")}</span>
        </span>
        <CaretRightIcon aria-hidden className="size-4 shrink-0 text-quiet-mist transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function TemplateGallery({
  onPick,
  onClose,
  pending,
}: {
  onPick: (t: WorkflowTemplate) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const t = useTranslations("features.automations.AutomationsManager");
  const tl = useTranslations("labels.automations");
  return (
    <Card className="mt-6 gap-3 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-near-ink">
            {t("starterRecipes")}
          </h2>
          <p className="mt-0.5 text-[13px] text-soft-ink">
            {t("pickTemplateHint")}
          </p>
        </div>
        <Button type="button" variant="soft" size="sm" onClick={onClose}>
          {t("close")}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {WORKFLOW_TEMPLATES.map((template) => {
          const copy = templateCopy(template, tl);
          return (
          <button
            key={template.id}
            type="button"
            onClick={() => onPick(template)}
            disabled={pending}
            className="group flex items-center gap-3 rounded-[var(--radius-inner)] p-3 text-left transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink disabled:opacity-60"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
              <LightningIcon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium uppercase tracking-wider text-quiet-mist">
                {copy.category}
              </span>
              <span className="block text-sm font-semibold text-near-ink">{copy.name}</span>
              <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-soft-ink">
                {copy.description}
              </span>
            </span>
            <CaretRightIcon aria-hidden className="size-4 shrink-0 text-quiet-mist transition-transform group-hover:translate-x-0.5" />
          </button>
          );
        })}
      </div>
    </Card>
  );
}
