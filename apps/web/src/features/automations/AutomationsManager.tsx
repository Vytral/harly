"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { toast } from "@/lib/notification-island/toast";

import { cn } from "@/lib/utils";
import { RelativeTime } from "@/lib/date-hydration";
import { Switch } from "@/components/ui/switch";
import {
  PencilIcon,
  PlusIcon,
  TrashIcon,
  LightningIcon,
  MagicWandDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [showTemplates, setShowTemplates] = useState(false);
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
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
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

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this automation?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `“${pendingDelete.name}” will be removed. This cannot be undone.`
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRemove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Header({ count, onCreate }: { count: number; onCreate: () => void }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-near-ink">
          Automations
        </h1>
        <p className="mt-1 text-sm text-soft-ink">
          {count} {count === 1 ? "recipe" : "recipes"} · when something happens,
          Harly can email, tag, task, or move a candidate.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={"/dashboard/automations/new" as Route}
          className="inline-flex items-center gap-1.5 rounded-full border border-mist-border bg-pure-snow px-4 py-2 text-sm font-medium text-near-ink transition-all hover:bg-soft-kraft active:scale-[0.98]"
        >
          <PlusIcon className="size-4" /> Start from scratch
        </Link>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 rounded-full bg-near-ink px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-near-ink/90 active:scale-[0.98]"
        >
          <MagicWandDuotoneIcon className="size-4" /> Templates
        </button>
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

  return (
    <div
      className={cn(
        "group flex flex-col rounded-2xl border bg-pure-snow p-5 shadow-xs transition-all",
        workflow.enabled
          ? "border-mist-border hover:border-near-ink/20 hover:shadow-sm"
          : "border-hairline opacity-65",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/dashboard/automations/${workflow.id}` as Route}
          className="flex min-w-0 flex-1 items-start gap-3"
        >
          <span
            className={cn(
              "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
              workflow.enabled
                ? "bg-near-ink text-primary-foreground"
                : "bg-soft-kraft text-soft-ink",
            )}
          >
            <LightningIcon className="size-4" />
          </span>
          <span className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold text-near-ink">
              {workflow.name}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-soft-ink">
              {nl}
            </p>
          </span>
        </Link>
        <Switch
          checked={workflow.enabled}
          onCheckedChange={onToggle}
          disabled={disabled || !canToggle}
          aria-label={workflow.enabled ? "Disable automation" : "Enable automation"}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 pl-11">
        <span className="inline-flex items-center gap-1 rounded-full bg-soft-kraft px-2.5 py-0.5 text-[11px] font-medium text-near-ink">
          {meta.label}
        </span>
        <span className="inline-flex items-center rounded-full bg-soft-kraft px-2.5 py-0.5 text-[11px] font-medium text-soft-ink">
          {actionCount} {actionCount === 1 ? "action" : "actions"}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            workflow.status === "published"
              ? "bg-near-ink text-primary-foreground"
              : "bg-soft-kraft text-soft-ink",
          )}
        >
          {workflow.hasUnpublishedChanges
            ? "Edits pending"
            : workflow.status === "published"
              ? "On"
              : workflow.status === "paused"
                ? "Paused"
                : "Draft"}
        </span>
        <span className="ml-auto text-[11px] text-soft-ink">
          edited <RelativeTime value={workflow.updatedAt} />
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3 pl-11">
        <Link
          href={`/dashboard/automations/${workflow.id}` as Route}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-near-ink hover:underline"
        >
          <PencilIcon className="size-3.5" /> Edit
        </Link>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-soft-ink transition-colors hover:text-danger-rust disabled:opacity-50"
        >
          <TrashIcon className="size-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onShowTemplates }: { onShowTemplates: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-near-ink text-primary-foreground shadow-xs">
        <MagicWandDuotoneIcon className="size-7" />
      </span>
      <h2 className="font-display mt-5 text-xl font-semibold text-near-ink">
        Automate the repetitive hiring work
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-soft-ink">
        Write a simple recipe:{" "}
        <strong className="font-medium text-near-ink">When</strong> a candidate
        applies or moves stage,{" "}
        <strong className="font-medium text-near-ink">if</strong> they match a
        filter, <strong className="font-medium text-near-ink">then</strong> send
        an email, create a task, or tag the profile.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href={"/dashboard/automations/new" as Route}
          className="inline-flex items-center gap-1.5 rounded-full border border-mist-border bg-pure-snow px-4 py-2 text-sm font-medium text-near-ink hover:bg-soft-kraft active:scale-[0.98]"
        >
          <PlusIcon className="size-4" /> Start from scratch
        </Link>
        <button
          type="button"
          onClick={onShowTemplates}
          className="inline-flex items-center gap-1.5 rounded-full bg-near-ink px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-near-ink/90 active:scale-[0.98]"
        >
          <MagicWandDuotoneIcon className="size-4" /> Choose a template
        </button>
      </div>
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
    <div className="mt-6 rounded-2xl border border-mist-border bg-pure-snow p-6 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-near-ink">
            Starter recipes
          </h2>
          <p className="mt-0.5 text-xs text-soft-ink">
            Pick one to start. You can change every detail in the editor.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-soft-ink hover:bg-soft-kraft hover:text-near-ink"
        >
          Close
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {WORKFLOW_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            disabled={pending}
            className="group flex flex-col rounded-xl border border-mist-border/80 bg-warm-paper p-4 text-left transition-all hover:border-near-ink/20 hover:bg-soft-kraft/40 disabled:opacity-60"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-soft-ink">
                {t.category}
              </span>
            </div>
            <span className="font-display mt-1 text-sm font-semibold text-near-ink">
              {t.name}
            </span>
            <span className="mt-1 text-xs leading-relaxed text-soft-ink">
              {t.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
