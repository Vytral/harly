"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { toast } from "@/lib/notification-island/toast";

import { cn } from "@/lib/utils";
import { FocusModeShell } from "@/components/focus-mode/FocusModeShell";
import { FocusModeTopBar } from "@/components/focus-mode/FocusModeTopBar";
import { useUnsavedChangesGuard } from "@/components/focus-mode/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/focus-mode/UnsavedChangesDialog";
import {
  ArrowLeftIcon,
  CheckIcon,
  EyeIcon,
  LoaderIcon,
} from "@/features/career-page/builder/builder-icons";

import {
  approveWorkflowAction,
  createWorkflowAction,
  dryRunWorkflowAction,
  getWorkflowMetricsAction,
  listWorkflowVersionsAction,
  pauseWorkflowAction,
  publishWorkflowAction,
  requestWorkflowApprovalAction,
  resumeWorkflowAction,
  rollbackWorkflowAction,
  previewWorkflowPayloadAction,
  updateWorkflowAction,
} from "../actions";
import type { SerializedWorkflow } from "./types";
import type {
  Action,
  ConditionNode,
  Trigger,
  WorkflowDefinitionInput,
  WorkflowEvent,
} from "../schema";

import { TriggerPanel } from "./TriggerPanel";
import { ConditionPanel } from "./ConditionPanel";
import { ActionsPanel } from "./ActionsPanel";
import { DryRunPanel } from "./DryRunPanel";
import { AddNodeIcon, BeakerIcon, NodeDotIcon, WhenGlyph } from "./builder-icons";
import { triggerMeta } from "./catalog";
import { describeWorkflow } from "./preview";

/**
 * The visual workflow builder — a full-page focus-mode editor (same shell as
 * the career page builder) laid out as a WHEN → IF → DO flow on a dotted
 * canvas. The recruiter edits a draft locally; "Save" persists it through the
 * server actions (create or update). "Test" runs a dry-run (T5) against a
 * sample candidate without saving.
 *
 * The draft is the exact `WorkflowDefinitionInput` shape the Zod schemas
 * validate, so what the recruiter builds is always persistable as-is.
 */

export type WorkflowDraft = WorkflowDefinitionInput & { id?: string };

function toDraft(w: SerializedWorkflow): WorkflowDraft {
  return {
    id: w.id,
    name: w.name,
    description: w.description ?? undefined,
    enabled: w.enabled,
    trigger: w.trigger,
    conditions: w.conditions,
    actions: w.actions,
    maxRunsPerMinute: w.maxRunsPerMinute,
    maxExternalActionsPerMinute: w.maxExternalActionsPerMinute,
    circuitBreakerThreshold: w.circuitBreakerThreshold,
    circuitBreakerCooldownSeconds: w.circuitBreakerCooldownSeconds,
  };
}

export function WorkflowBuilder({
  initial,
  builderData,
  isNew,
}: {
  initial: SerializedWorkflow | null;
  builderData: { members: { id: string; name: string }[]; stageNames: string[]; candidates: { id: string; name: string; email: string }[] };
  isNew: boolean;
}) {
  const [draft, setDraft] = useState<WorkflowDraft>(() =>
    initial
      ? toDraft(initial)
      : {
          name: "Untitled automation",
          enabled: true,
          trigger: { event: "application.created" as WorkflowEvent },
          conditions: [],
          actions: [{ type: "send_slack", config: { message: "New application received." }, continueOnError: true }],
          maxRunsPerMinute: 60,
          maxExternalActionsPerMinute: 30,
          circuitBreakerThreshold: 5,
          circuitBreakerCooldownSeconds: 300,
        },
  );
  const [dirty, setDirty] = useState(isNew);
  const [status, setStatus] = useState<SerializedWorkflow["status"]>(initial?.status ?? "draft");
  const [approved, setApproved] = useState(Boolean(initial?.approvedAt));
  const [saving, startSave] = useTransition();
  const [tab, setTab] = useState<"build" | "test">("build");
  const { confirmDiscard, discardDialogProps } = useUnsavedChangesGuard(dirty);

  const update = useCallback((producer: (d: WorkflowDraft) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev);
      producer(next);
      return next;
    });
    setDirty(true);
  }, []);

  const setTrigger = useCallback(
    (trigger: Trigger) => update((d) => { d.trigger = trigger; }),
    [update],
  );
  const setConditions = useCallback(
    (conditions: ConditionNode[]) => update((d) => { d.conditions = conditions; }),
    [update],
  );
  const setActions = useCallback(
    (actions: Action[]) => update((d) => { d.actions = actions; }),
    [update],
  );

  async function handleExit() {
    if (!(await confirmDiscard())) return;
    window.location.href = "/dashboard/automations";
  }

  function handleSave() {
    if (!dirty || saving) return;
    startSave(async () => {
      const payload: WorkflowDefinitionInput = {
        name: draft.name,
        description: draft.description,
        enabled: draft.enabled,
        trigger: draft.trigger,
        conditions: draft.conditions,
        actions: draft.actions,
        maxRunsPerMinute: draft.maxRunsPerMinute,
        maxExternalActionsPerMinute: draft.maxExternalActionsPerMinute,
        circuitBreakerThreshold: draft.circuitBreakerThreshold,
        circuitBreakerCooldownSeconds: draft.circuitBreakerCooldownSeconds,
      };
      const result = draft.id
        ? await updateWorkflowAction(draft.id, payload)
        : await createWorkflowAction(payload);
      if (result.ok && result.workflow) {
        toast.success("Automation saved.");
        setDirty(false);
        setStatus(result.workflow.status);
        setApproved(Boolean(result.workflow.approvedAt));
        // After a create, switch the draft to edit mode so subsequent saves update.
        if (!draft.id) {
          setDraft((d) => ({ ...d, id: result.workflow!.id }));
        }
      } else {
        toast.error(result.error ?? "Could not save.");
      }
    });
  }

  function runGovernanceAction(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
    nextStatus: SerializedWorkflow["status"],
    nextApproved = approved,
  ) {
    startSave(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "Could not update workflow state.");
        return;
      }
      toast.success(success);
      setStatus(nextStatus);
      setApproved(nextApproved);
    });
  }

  const nl = useMemo(
    () => describeWorkflow({ trigger: draft.trigger, conditions: draft.conditions, actions: draft.actions }),
    [draft.trigger, draft.conditions, draft.actions],
  );

  const meta = triggerMeta(draft.trigger.event);

  return (
    <>
    <FocusModeShell
      topBar={
        <FocusModeTopBar
          left={
            <button
              type="button"
              onClick={handleExit}
              className="group inline-flex items-center gap-2 rounded-full border border-border bg-paper-raised/60 py-1.5 pl-2.5 pr-3.5 text-sm font-medium text-ink-soft shadow-sm transition-all duration-150 hover:border-pine/30 hover:bg-kraft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/30 active:scale-[0.97]"
            >
              <ArrowLeftIcon className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
              <span className="hidden sm:inline">Back to automations</span>
            </button>
          }
          center={
            <div className="flex items-center gap-2">
              <span className="font-cal inline-flex items-center gap-1.5 rounded-full border border-border bg-kraft/60 px-3 py-1 text-sm font-semibold text-ink-soft">
                <WhenGlyph className="size-3.5 text-pine" />
                {meta.label}
              </span>
              <input
                value={draft.name}
                onChange={(e) => update((d) => { d.name = e.target.value; })}
                className="font-cal w-[min(34vw,260px)] truncate rounded-full border border-transparent bg-transparent px-3 py-1 text-sm font-semibold text-foreground outline-none transition-colors hover:border-border focus:border-pine/30 focus:bg-kraft/40"
                aria-label="Automation name"
              />
            </div>
          }
          right={
            <>
              <span className={cn(
                "hidden rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide sm:inline",
                status === "published" ? "bg-sage text-sage-ink" : status === "paused" ? "bg-kraft text-ink-soft" : "bg-amber-100 text-amber-900",
              )}>
                {status}
              </span>
              {draft.id && status === "draft" && !approved && (
                <button type="button" onClick={() => runGovernanceAction(
                  () => requestWorkflowApprovalAction(draft.id!),
                  "Approval requested.", "draft",
                )} disabled={saving} className="hidden text-xs font-medium text-ink-soft hover:text-foreground lg:inline">
                  Request approval
                </button>
              )}
              {draft.id && status === "draft" && approved && (
                <button type="button" onClick={() => runGovernanceAction(
                  () => publishWorkflowAction(draft.id!),
                  "Workflow published.", "published",
                )} disabled={saving} className="hidden rounded-lg bg-pine px-3 py-1.5 text-xs font-semibold text-white hover:bg-pine-strong lg:inline">
                  Publish
                </button>
              )}
              {draft.id && status === "published" && (
                <button type="button" onClick={() => runGovernanceAction(
                  () => pauseWorkflowAction(draft.id!),
                  "Workflow paused.", "paused",
                )} disabled={saving} className="hidden text-xs font-medium text-ink-soft hover:text-rust lg:inline">
                  Pause
                </button>
              )}
              {draft.id && status === "paused" && (
                <button type="button" onClick={() => runGovernanceAction(
                  () => resumeWorkflowAction(draft.id!),
                  "Workflow resumed as a draft.", "draft", false,
                )} disabled={saving} className="hidden text-xs font-medium text-ink-soft hover:text-foreground lg:inline">
                  Resume editing
                </button>
              )}
              <div className="hidden items-center gap-1 rounded-lg border border-border bg-kraft/40 p-0.5 sm:flex">
                <TabButton active={tab === "build"} onClick={() => setTab("build")}>
                  <AddNodeIcon className="size-3.5" /> Build
                </TabButton>
                <TabButton active={tab === "test"} onClick={() => setTab("test")}>
                  <BeakerIcon className="size-3.5" /> Test
                </TabButton>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-150",
                  dirty && !saving
                    ? "bg-pine text-white hover:bg-pine-strong active:scale-[0.97]"
                    : "bg-kraft text-ink-soft",
                  saving && "cursor-wait opacity-70",
                )}
              >
                {saving ? <LoaderIcon className="size-4 animate-spin" /> : dirty ? null : <CheckIcon className="size-4" />}
                {saving ? "Saving…" : dirty ? "Save" : "Saved"}
              </button>
            </>
          }
        />
      }
    >
      <BuilderCanvas tab={tab}>
        {tab === "build" ? (
          <BuildView
            draft={draft}
            builderData={builderData}
            nl={nl}
            onTrigger={setTrigger}
            onConditions={setConditions}
            onActions={setActions}
            onGuardrails={(patch) => update((d) => Object.assign(d, patch))}
          />
        ) : (
          <TestView draft={draft} candidates={builderData.candidates} />
        )}
      </BuilderCanvas>
    </FocusModeShell>
    {draft.id && <VersionHistory workflowId={draft.id} currentVersion={initial?.definitionVersion ?? 1} draft={draft} />}
    {draft.id && <WorkflowMetrics workflowId={draft.id} />}
    <UnsavedChangesDialog
      open={discardDialogProps.open}
      onConfirm={discardDialogProps.onConfirm}
      onCancel={discardDialogProps.onCancel}
    />
    </>
  );
}

function WorkflowMetrics({ workflowId }: { workflowId: string }) {
  const [metrics, setMetrics] = useState<{
    total: number; succeeded: number; failed: number; running: number; deadLetters: number; retries: number; successRate: number; averageDurationMs: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void getWorkflowMetricsAction(workflowId).then((result) => {
      if (active && result.ok) setMetrics(result.metrics);
    });
    return () => { active = false; };
  }, [workflowId]);
  if (!metrics) return null;
  return (
    <section className="mx-auto w-full max-w-3xl border-t border-hairline px-5 py-8 sm:px-8">
      <h2 className="font-display text-sm font-semibold text-foreground">Operational metrics</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Runs", metrics.total],
          ["Success", `${Math.round(metrics.successRate * 100)}%`],
          ["Retries", metrics.retries],
          ["Dead letters", metrics.deadLetters],
          ["Failed", metrics.failed],
          ["Running", metrics.running],
          ["Avg duration", `${metrics.averageDurationMs}ms`],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-hairline bg-paper-raised px-3 py-2">
            <p className="text-[11px] text-ink-soft">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

type WorkflowVersionRow = {
  id: string;
  version: number;
  name: string;
  triggerEvent: string;
  trigger: unknown;
  conditions: unknown;
  actions: unknown;
  createdAt: string;
  publishedAt: string | null;
};

function VersionHistory({
  workflowId,
  currentVersion,
  draft,
}: {
  workflowId: string;
  currentVersion: number;
  draft: WorkflowDraft;
}) {
  const [versions, setVersions] = useState<WorkflowVersionRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void listWorkflowVersionsAction(workflowId).then((result) => {
      if (active && result.ok) setVersions((result.versions ?? []) as WorkflowVersionRow[]);
    });
    return () => { active = false; };
  }, [workflowId]);

  const selectedVersion = versions.find((version) => version.version === selected);
  const differs = selectedVersion
    ? JSON.stringify({ trigger: draft.trigger, conditions: draft.conditions, actions: draft.actions }) !==
      JSON.stringify({ trigger: selectedVersion.trigger, conditions: selectedVersion.conditions, actions: selectedVersion.actions })
    : false;

  if (versions.length < 2) return null;
  return (
    <section className="mx-auto w-full max-w-3xl border-t border-hairline px-5 py-8 sm:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold text-foreground">Version history</h2>
          <p className="mt-1 text-xs text-ink-soft">Immutable definitions used for audit and rollback.</p>
        </div>
        <span className="text-xs text-ink-soft">Current v{currentVersion}</span>
      </div>
      <div className="mt-4 space-y-2">
        {versions.map((version) => (
          <div key={version.id} className="rounded-lg border border-hairline bg-paper-raised p-3">
            <button type="button" onClick={() => setSelected(selected === version.version ? null : version.version)} className="flex w-full items-center justify-between text-left">
              <span className="text-sm font-medium text-foreground">v{version.version} · {version.triggerEvent}</span>
              <span className="text-xs text-ink-soft">{version.publishedAt ? "Published" : "Draft"}</span>
            </button>
            {selected === version.version && (
              <div className="mt-3 border-t border-hairline pt-3 text-xs text-ink-soft">
                <p>{Array.isArray(version.actions) ? version.actions.length : 0} actions · {Array.isArray(version.conditions) ? version.conditions.length : 0} conditions · created {new Date(version.createdAt).toLocaleString()}</p>
                <p className={cn("mt-1 font-medium", differs ? "text-rust" : "text-pine")}>{differs ? "Differs from current draft" : "Matches current draft"}</p>
                {version.version !== currentVersion && (
                  <button type="button" disabled={pending} onClick={() => {
                    if (!window.confirm(`Rollback to version ${version.version}? This creates a new draft version.`)) return;
                    startTransition(async () => {
                      const result = await rollbackWorkflowAction(workflowId, version.version);
                      if (result.ok) window.location.reload();
                      else toast.error(result.error ?? "Could not roll back.");
                    });
                  }} className="mt-2 rounded-md border border-border px-2.5 py-1.5 font-medium text-foreground hover:bg-kraft disabled:opacity-50">
                    Roll back to v{version.version}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150",
        active ? "bg-paper-raised text-foreground shadow-sm" : "text-ink-soft hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The dotted canvas — the modern "connect things on a grid" backdrop
// ---------------------------------------------------------------------------

function BuilderCanvas({ tab, children }: { tab: "build" | "test"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "relative min-h-0 flex-1 overflow-y-auto",
        // Dotted grid: tiny dots on the warm canvas, the modern visual-diagram
        // backdrop. Pure CSS radial-gradient, no image asset.
        tab === "build" && "bg-[radial-gradient(var(--hairline)_1px,transparent_1px)] [background-size:18px_18px]",
        tab === "test" && "bg-paper",
      )}
    >
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build view — the WHEN → IF → DO vertical flow
// ---------------------------------------------------------------------------

function BuildView({
  draft,
  builderData,
  nl,
  onTrigger,
  onConditions,
  onActions,
  onGuardrails,
}: {
  draft: WorkflowDraft;
  builderData: { members: { id: string; name: string }[]; stageNames: string[]; candidates: { id: string; name: string; email: string }[] };
  nl: string;
  onTrigger: (t: Trigger) => void;
  onConditions: (c: ConditionNode[]) => void;
  onActions: (a: Action[]) => void;
  onGuardrails: (patch: Partial<Pick<WorkflowDraft, "maxRunsPerMinute" | "maxExternalActionsPerMinute" | "circuitBreakerThreshold" | "circuitBreakerCooldownSeconds">>) => void;
}) {
  return (
    <div className="space-y-5">
      <PreviewStrip text={nl} />

      <FlowStep
        marker={<WhenGlyph className="size-4" />}
        label="WHEN"
        caption="Trigger"
        summary={triggerMeta(draft.trigger.event).label}
      >
        <TriggerPanel value={draft.trigger} onChange={onTrigger} />
      </FlowStep>

      <Connector />

      <FlowStep
        marker={<IfGlyphSmall />}
        label="IF"
        caption="Condition"
        summary={
          (draft.conditions ?? []).length === 0
            ? "Always runs"
            : `${(draft.conditions ?? []).length} ${(draft.conditions ?? []).length === 1 ? "condition" : "conditions"}`
        }
      >
        <ConditionPanel value={draft.conditions ?? []} onChange={onConditions} />
      </FlowStep>

      <Connector />

      <FlowStep
        marker={<DoGlyphSmall />}
        label="DO"
        caption="Actions"
        summary={`${draft.actions.length} ${draft.actions.length === 1 ? "step" : "steps"}`}
      >
        <ActionsPanel
          value={draft.actions}
          onChange={onActions}
          stageNames={builderData.stageNames}
          members={builderData.members}
        />
      </FlowStep>
      <GuardrailsPanel draft={draft} onChange={onGuardrails} />
    </div>
  );
}

function PreviewStrip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-mist-border bg-paper-raised px-4 py-3 shadow-soft">
      <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-sage text-sage-ink">
        <EyeIcon className="size-3.5" />
      </span>
      <p className="text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  );
}

function GuardrailsPanel({
  draft,
  onChange,
}: {
  draft: WorkflowDraft;
  onChange: (patch: Partial<Pick<WorkflowDraft, "maxRunsPerMinute" | "maxExternalActionsPerMinute" | "circuitBreakerThreshold" | "circuitBreakerCooldownSeconds">>) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-paper-raised p-4 shadow-soft">
      <div>
        <h2 className="font-display text-sm font-semibold text-foreground">Operational guardrails</h2>
        <p className="mt-1 text-xs text-ink-soft">Protect providers and pause noisy workflows automatically.</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["maxRunsPerMinute", "Runs / min"],
          ["maxExternalActionsPerMinute", "External / min"],
          ["circuitBreakerThreshold", "Failures"],
          ["circuitBreakerCooldownSeconds", "Cooldown (s)"],
        ] as const).map(([key, label]) => (
          <label key={key} className="text-xs text-ink-soft">
            {label}
            <input type="number" min={1} value={draft[key] ?? ""} onChange={(event) => onChange({ [key]: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-border bg-paper px-2.5 py-1.5 text-sm text-foreground" />
          </label>
        ))}
      </div>
    </section>
  );
}

function FlowStep({
  marker,
  label,
  caption,
  summary,
  children,
}: {
  marker: React.ReactNode;
  label: string;
  caption: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-paper-raised shadow-soft">
      <header className="flex items-center gap-3 border-b border-hairline px-4 py-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-kraft text-foreground">
          {marker}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-bold tracking-wide text-foreground">{label}</span>
          <span className="block truncate text-xs text-ink-soft">{caption}</span>
        </span>
        <span className="shrink-0 rounded-full bg-kraft px-2.5 py-1 text-[11px] font-medium tracking-wide text-ink-soft">
          {summary}
        </span>
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Connector() {
  return (
    <div className="relative flex h-6 justify-center" aria-hidden>
      <svg width="2" height="24" className="text-mist-border">
        <line x1="1" y1="0" x2="1" y2="24" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
      <NodeDotIcon className="absolute top-1/2 size-1.5 -translate-y-1/2 text-quiet-mist" />
    </div>
  );
}

// Small inline glyphs re-used in the flow steps (kept here to avoid a circular
// import with builder-icons for the lazy condition/action panels).
function IfGlyphSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M3 4h18l-7 8v6l-4 2v-8L3 4z" />
    </svg>
  );
}
function DoGlyphSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 8l8 4-8 4V8z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Test view — dry-run against a sample candidate
// ---------------------------------------------------------------------------

function TestView({ draft, candidates }: { draft: WorkflowDraft; candidates: Array<{ id: string; name: string; email: string }> }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-paper-raised px-4 py-3">
        <h2 className="font-cal text-sm font-bold text-foreground">Test this automation</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Choose a real workspace candidate and inspect the event payload. No actions run, nothing is saved.
        </p>
      </div>
      <DryRunPanel
        trigger={draft.trigger}
        conditions={draft.conditions ?? []}
        candidates={candidates}
        preview={previewWorkflowPayloadAction}
        run={dryRunWorkflowAction}
      />
      <p className="text-center text-xs text-ink-soft">
        <Link href={"/dashboard/automations" as Route} className="underline-offset-2 hover:underline">
          ← Back to automations
        </Link>
      </p>
    </div>
  );
}
