"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "./builder/templates";
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
        toast.error(r.error ?? "Could not toggle automation.");
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
        toast.error(r.error ?? "Could not delete.");
      } else {
        toast.success("Automation deleted.");
      }
    });
  }

  function fromTemplate(t: WorkflowTemplate) {
    startTransition(async () => {
      const r = await createWorkflowFromTemplateAction(t.build());
      if (r.ok && r.workflow) {
        toast.success(`Created “${t.name}”.`);
        window.location.href = `/dashboard/automations/${r.workflow.id}` as Route;
      } else {
        toast.error(r.error ?? "Could not create from template.");
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
        title="Delete this automation?"
        description={
          pendingDelete
            ? `“${pendingDelete.name}” will stop running and be removed. This cannot be undone.`
            : "This cannot be undone."
        }
        confirmLabel="Delete automation"
        cancelLabel="Keep it"
        onConfirm={confirmRemove}
      />
    </div>
  );
}

function Header({ count, onCreate }: { count: number; onCreate: () => void }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-near-ink">
          Automations
        </h1>
        <p className="mt-1 text-sm text-soft-ink">
          {count} {count === 1 ? "recipe" : "recipes"} · when something happens,
          Harly can email, tag, task, or move a candidate.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline">
          <Link href={"/dashboard/automations/new" as Route}>
            <PlusIcon className="size-4" /> Start from scratch
          </Link>
        </Button>
        <Button type="button" onClick={onCreate}>
          <MagicWandDuotoneIcon className="size-4" /> Templates
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
  const meta = triggerMeta(workflow.trigger.event);
  const graph = workflow.engineVersion === 2 ? workflow.graph : undefined;
  const nl = graph
    ? describeGraphWorkflow(graph)
    : describeWorkflow({
        trigger: workflow.trigger,
        conditions: workflow.conditions,
        actions: workflow.actions,
      });
  const actionCount = graph ? graphActionCount(graph) : workflow.actions.length;
  const canToggle = workflow.status === "published" || workflow.status === "paused";

  const statusLabel = workflow.hasUnpublishedChanges
    ? "Edits pending"
    : workflow.status === "published"
      ? "On"
      : workflow.status === "paused"
        ? "Paused"
        : "Draft";

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
            {meta.label} · {actionCount} {actionCount === 1 ? "action" : "actions"} · edited{" "}
            <RelativeTime value={workflow.updatedAt} />
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label={`Delete ${workflow.name}`}
        className="inline-flex size-8 items-center justify-center rounded-full text-soft-ink transition-colors hover:bg-soft-kraft hover:text-danger-rust focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink disabled:opacity-50"
      >
        <TrashIcon className="size-4" />
      </button>
      <Switch
        checked={workflow.enabled}
        onCheckedChange={onToggle}
        disabled={disabled || !canToggle}
        aria-label={workflow.enabled ? "Disable automation" : "Enable automation"}
      />
      <CaretRightIcon aria-hidden className="size-4 shrink-0 text-quiet-mist" />
    </div>
  );
}

function EmptyState({ onShowTemplates }: { onShowTemplates: () => void }) {
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
            Automate the repetitive hiring work
          </h1>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-soft-ink">
            Write a simple recipe:{" "}
            <strong className="font-medium text-near-ink">When</strong> a candidate
            applies or moves stage,{" "}
            <strong className="font-medium text-near-ink">if</strong> they match a
            filter, <strong className="font-medium text-near-ink">then</strong> send
            an email, create a task, or tag the profile.
          </p>
        </div>
      </div>
      <button type="button" onClick={onShowTemplates} className={choice}>
        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
          <MagicWandDuotoneIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-near-ink">Choose a template</span>
          <span className="mt-0.5 block text-[13px] text-soft-ink">Start from a ready-made recipe and tweak every detail.</span>
        </span>
        <CaretRightIcon aria-hidden className="size-4 shrink-0 text-quiet-mist transition-transform group-hover:translate-x-0.5" />
      </button>
      <Link href={"/dashboard/automations/new" as Route} className={choice}>
        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
          <PlusIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-near-ink">Start from scratch</span>
          <span className="mt-0.5 block text-[13px] text-soft-ink">Build your own recipe in the editor.</span>
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
  return (
    <Card className="mt-6 gap-3 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-near-ink">
            Starter recipes
          </h2>
          <p className="mt-0.5 text-[13px] text-soft-ink">
            Pick one to start. You can change every detail in the editor.
          </p>
        </div>
        <Button type="button" variant="soft" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {WORKFLOW_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            disabled={pending}
            className="group flex items-center gap-3 rounded-[var(--radius-inner)] p-3 text-left transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink disabled:opacity-60"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
              <LightningIcon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium uppercase tracking-wider text-quiet-mist">
                {t.category}
              </span>
              <span className="block text-sm font-semibold text-near-ink">{t.name}</span>
              <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-soft-ink">
                {t.description}
              </span>
            </span>
            <CaretRightIcon aria-hidden className="size-4 shrink-0 text-quiet-mist transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </Card>
  );
}
