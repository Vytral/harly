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
  createWorkflowFromTemplateAction,
  deleteWorkflowAction,
  toggleWorkflowAction,
} from "./actions";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "./builder/templates";
import { describeWorkflow } from "./builder/preview";
import { triggerMeta } from "./builder/catalog";
import type { SerializedWorkflow } from "./builder/types";

/**
 * The automations index — a card grid of the workspace's workflows with an
 * enable/disable Switch, a natural-language summary, edit link into the
 * fullscreen builder, and delete. The empty state shows the template gallery
 * so a non-technical recruiter can spin up a starter workflow in one click.
 */
export function AutomationsManager({
  initialWorkflows,
}: {
  initialWorkflows: SerializedWorkflow[];
}) {
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [showTemplates, setShowTemplates] = useState(false);
  const [pending, startTransition] = useTransition();

  const isEmpty = workflows.length === 0;

  function toggle(id: string, enabled: boolean, i: number) {
    // Optimistic flip; revert on error.
    setWorkflows((prev) => prev.map((w, j) => (j === i ? { ...w, enabled } : w)));
    startTransition(async () => {
      const r = await toggleWorkflowAction(id, enabled);
      if (!r.ok) {
        setWorkflows((prev) => prev.map((w, j) => (j === i ? { ...w, enabled: !enabled } : w)));
        toast.error(r.error ?? "Could not toggle.");
      }
    });
  }

  function remove(id: string, i: number) {
    if (!window.confirm("Delete this automation? This cannot be undone.")) return;
    setWorkflows((prev) => prev.filter((_, j) => j !== i));
    startTransition(async () => {
      const r = await deleteWorkflowAction(id);
      if (!r.ok) {
        toast.error(r.error ?? "Could not delete.");
        // Re-fetch by reloading; simplest correct fallback.
        window.location.reload();
      } else {
        toast.success("Automation deleted.");
      }
    });
  }

  function fromTemplate(t: WorkflowTemplate) {
    startTransition(async () => {
      const r = await createWorkflowFromTemplateAction(t.build());
      if (r.ok && r.workflow) {
        toast.success(`Created "${t.name}".`);
        // Send the user into the builder for the new workflow.
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

      {showTemplates && (
        <TemplateGallery
          onPick={fromTemplate}
          onClose={() => setShowTemplates(false)}
          pending={pending}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {workflows.map((w, i) => (
          <WorkflowCard
            key={w.id}
            workflow={w}
            onToggle={(enabled) => toggle(w.id, enabled, i)}
            onDelete={() => remove(w.id, i)}
            disabled={pending}
          />
        ))}
      </div>
    </div>
  );
}

function Header({ count, onCreate }: { count: number; onCreate: () => void }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Automations</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {count} {count === 1 ? "workflow" : "workflows"} · when something happens, do work automatically.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 rounded-lg bg-pine px-3.5 py-2 text-sm font-medium text-white transition-all hover:bg-pine-strong active:scale-[0.97]"
      >
        <PlusIcon className="size-4" /> New automation
      </button>
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
  const nl = describeWorkflow({
    trigger: workflow.trigger,
    conditions: workflow.conditions,
    actions: workflow.actions,
  });
  return (
    <div
      className={cn(
        "group flex flex-col rounded-2xl border bg-paper-raised p-4 shadow-sm transition-all hover:shadow-md",
        workflow.enabled ? "border-border" : "border-border/60 opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/dashboard/automations/${workflow.id}` as Route}
          className="min-w-0 flex-1"
        >
          <div className="flex items-center gap-2">
            <LightningIcon className={cn("size-4 shrink-0", workflow.enabled ? "text-pine" : "text-ink-soft/50")} />
            <h3 className="truncate font-cal text-base font-semibold text-foreground group-hover:text-pine">
              {workflow.name}
            </h3>
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">{nl}</p>
        </Link>
        <Switch
          checked={workflow.enabled}
          onCheckedChange={onToggle}
          disabled={disabled}
          aria-label={workflow.enabled ? "Disable automation" : "Enable automation"}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-sage/50 px-2 py-0.5 text-[11px] font-medium text-sage-ink">
          {meta.label}
        </span>
        <span className="inline-flex items-center rounded-full bg-kraft px-2 py-0.5 text-[11px] font-medium text-ink-soft">
          {workflow.actions.length} {workflow.actions.length === 1 ? "action" : "actions"}
        </span>
        <span className="text-[11px] text-ink-soft">
          edited <RelativeTime value={workflow.updatedAt} />
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
        <Link
          href={`/dashboard/automations/${workflow.id}` as Route}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-pine hover:underline"
        >
          <PencilIcon className="size-3.5" /> Edit
        </Link>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-rust disabled:opacity-50"
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
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-sage/50 text-pine">
        <MagicWandDuotoneIcon className="size-7" />
      </span>
      <h2 className="font-cal mt-5 text-xl font-semibold text-foreground">Automate your hiring busywork</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
        Build a workflow once: <strong className="text-foreground">when</strong> something happens (a candidate applies, a stage changes),
        <strong className="text-foreground"> if</strong> a condition holds,
        <strong className="text-foreground"> then</strong> take action — tag, notify, create a task, move a stage.
      </p>
      <button
        type="button"
        onClick={onShowTemplates}
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-pine px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-pine-strong active:scale-[0.97]"
      >
        <MagicWandDuotoneIcon className="size-4" /> Start from a template
      </button>
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
    <div className="mt-6 rounded-2xl border border-border bg-paper-raised p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-cal text-lg font-semibold text-foreground">Start from a template</h2>
          <p className="mt-0.5 text-sm text-ink-soft">Pick a starter. You can edit everything in the builder.</p>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-ink-soft hover:text-foreground">Close</button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {WORKFLOW_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            disabled={pending}
            className="group flex flex-col rounded-xl border border-border bg-kraft/20 p-3.5 text-left transition-all hover:border-pine/30 hover:bg-kraft/50 disabled:opacity-60"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{t.category}</span>
              <span className="text-pine opacity-0 transition-opacity group-hover:opacity-100">→</span>
            </div>
            <span className="font-cal mt-1 text-sm font-semibold text-foreground">{t.name}</span>
            <span className="mt-1 text-xs leading-relaxed text-ink-soft">{t.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
