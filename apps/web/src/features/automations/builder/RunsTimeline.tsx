"use client";

import { useEffect, useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import { RelativeTime } from "@/lib/date-hydration";
import { CheckCircleIcon, XCircleIcon, ClockIcon, ProhibitIcon } from "@/components/ui/icons/phosphor";

import { getRunAction, listRunsAction } from "../actions";
import { actionMeta } from "./catalog";
import type { SerializedRun, SerializedRunStep } from "./types";

/**
 * Run history for a workflow: the latest runs with status badges, each
 * expandable to its step timeline (action → result → duration → error).
 * Loads lazily on expand so the list stays cheap. Uses the server actions
 * (gated by automations:manage), not the REST API.
 */
export function RunsTimeline({ workflowId }: { workflowId: string }) {
  const [runs, setRuns] = useState<SerializedRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startLoad] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const r = await listRunsAction({ workflowId, limit: 20 });
      if (r.ok) setRuns(r.runs as SerializedRun[]);
      else setError(r.error ?? "Could not load runs.");
    });
  }, [workflowId]);

  if (pending && runs === null) {
    return <p className="text-sm text-ink-soft">Loading runs…</p>;
  }
  if (error) {
    return <p className="text-sm text-rust">{error}</p>;
  }
  if (runs && runs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-kraft/20 px-4 py-6 text-center text-sm text-ink-soft">
        No runs yet. This workflow will show its execution history here once it fires.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {runs?.map((run) => (
        <RunRow key={run.id} run={run} />
      ))}
    </div>
  );
}

function RunRow({ run }: { run: SerializedRun }) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<SerializedRunStep[] | null>(null);
  const [pending, startLoad] = useTransition();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && steps === null) {
      startLoad(async () => {
        const r = await getRunAction(run.id);
        if (r.ok) setSteps(r.steps as SerializedRunStep[]);
      });
    }
  }

  return (
    <div className="rounded-xl border border-border bg-paper-raised">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-kraft/30"
        aria-expanded={open}
      >
        <StatusBadge status={run.status} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            <span className="text-ink-soft">trigger:</span> {run.triggerEvent}
          </p>
          <p className="text-xs text-ink-soft">
            <RelativeTime value={run.startedAt} /> · {run.status}
          </p>
        </div>
        {run.error && <span className="truncate text-xs text-rust">{run.error}</span>}
        <span className={cn("text-xs text-ink-soft transition-transform", open && "rotate-180")}>▾</span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          {pending && steps === null ? (
            <p className="text-xs text-ink-soft">Loading steps…</p>
          ) : steps && steps.length > 0 ? (
            <ol className="space-y-2">
              {steps.map((step, i) => (
                <StepRow key={step.id} index={i} step={step} />
              ))}
            </ol>
          ) : (
            <p className="text-xs text-ink-soft">No steps recorded.</p>
          )}
        </div>
      )}
    </div>
  );
}

function StepRow({ index, step }: { index: number; step: SerializedRunStep }) {
  const meta = actionMeta(step.actionType as never);
  const duration = step.finishedAt
    ? `${Math.round(new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime())}ms`
    : "—";
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-kraft text-[10px] font-semibold text-ink-soft">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{meta?.label ?? step.actionType}</span>
          <span className="flex items-center gap-2 text-xs text-ink-soft">
            <StepStatus status={step.status} />
            {duration}
          </span>
        </div>
        {step.status === "failed" && isErrorResult(step.result) && (
          <p className="mt-0.5 truncate text-xs text-rust">
            {String((step.result as { error?: unknown }).error ?? "Step failed.")}
          </p>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: SerializedRun["status"] }) {
  const map = {
    running: { icon: ClockIcon, cls: "bg-slate-info/10 text-slate-info", label: "Running" },
    succeeded: { icon: CheckCircleIcon, cls: "bg-success/10 text-success", label: "OK" },
    failed: { icon: XCircleIcon, cls: "bg-rust/10 text-rust", label: "Failed" },
    skipped: { icon: ProhibitIcon, cls: "bg-kraft text-ink-soft", label: "Skipped" },
    dead_letter: { icon: XCircleIcon, cls: "bg-rust/20 text-rust", label: "Dead letter" },
  }[status];
  const Icon = map.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", map.cls)}>
      <Icon className="size-3" />
      {map.label}
    </span>
  );
}

function StepStatus({ status }: { status: SerializedRunStep["status"] }) {
  if (status === "succeeded") return <span className="text-success">✓</span>;
  if (status === "failed") return <span className="text-rust">✕</span>;
  if (status === "running") return <span className="text-slate-info">…</span>;
  return <span className="text-ink-soft">–</span>;
}

/** Type guard: a failed step's result often carries `{ error: string }`. */
function isErrorResult(result: unknown): result is { error?: unknown } {
  return Boolean(result && typeof result === "object" && "error" in (result as Record<string, unknown>));
}
