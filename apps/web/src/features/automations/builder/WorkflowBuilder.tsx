"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { FocusModeShell } from "@/components/focus-mode/FocusModeShell";
import { FocusModeTopBar } from "@/components/focus-mode/FocusModeTopBar";
import { useUnsavedChangesGuard } from "@/components/focus-mode/useUnsavedChangesGuard";
import {
  ArrowLeftIcon,
  CheckIcon,
  EyeIcon,
  LoaderIcon,
} from "@/features/career-page/builder/builder-icons";

import {
  createWorkflowAction,
  dryRunWorkflowAction,
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
import { AddNodeIcon, BeakerIcon, WhenGlyph } from "./builder-icons";
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
  };
}

export function WorkflowBuilder({
  initial,
  builderData,
  isNew,
}: {
  initial: SerializedWorkflow | null;
  builderData: { members: { id: string; name: string }[]; stageNames: string[] };
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
        },
  );
  const [dirty, setDirty] = useState(isNew);
  const [saving, startSave] = useTransition();
  const [tab, setTab] = useState<"build" | "test">("build");
  const { confirmDiscard } = useUnsavedChangesGuard(dirty);

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

  function handleExit() {
    if (!confirmDiscard()) return;
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
      };
      const result = draft.id
        ? await updateWorkflowAction(draft.id, payload)
        : await createWorkflowAction(payload);
      if (result.ok && result.workflow) {
        toast.success("Automation saved.");
        setDirty(false);
        // After a create, switch the draft to edit mode so subsequent saves update.
        if (!draft.id) {
          setDraft((d) => ({ ...d, id: result.workflow!.id }));
        }
      } else {
        toast.error(result.error ?? "Could not save.");
      }
    });
  }

  const nl = useMemo(
    () => describeWorkflow({ trigger: draft.trigger, conditions: draft.conditions, actions: draft.actions }),
    [draft.trigger, draft.conditions, draft.actions],
  );

  const meta = triggerMeta(draft.trigger.event);

  return (
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
          />
        ) : (
          <TestView draft={draft} />
        )}
      </BuilderCanvas>
    </FocusModeShell>
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
}: {
  draft: WorkflowDraft;
  builderData: { members: { id: string; name: string }[]; stageNames: string[] };
  nl: string;
  onTrigger: (t: Trigger) => void;
  onConditions: (c: ConditionNode[]) => void;
  onActions: (a: Action[]) => void;
}) {
  return (
    <div className="space-y-5">
      <PreviewStrip text={nl} />

      <FlowStep marker={<WhenGlyph className="size-4" />} label="WHEN" tone="pine">
        <TriggerPanel value={draft.trigger} onChange={onTrigger} />
      </FlowStep>

      <Connector />

      <FlowStep marker={<IfGlyphSmall />} label="IF" tone="slate">
        <ConditionPanel value={draft.conditions ?? []} onChange={onConditions} />
      </FlowStep>

      <Connector />

      <FlowStep marker={<DoGlyphSmall />} label="DO" tone="lime">
        <ActionsPanel
          value={draft.actions}
          onChange={onActions}
          stageNames={builderData.stageNames}
          members={builderData.members}
        />
      </FlowStep>
    </div>
  );
}

function PreviewStrip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-pine/20 bg-sage/40 px-4 py-3">
      <EyeIcon className="mt-0.5 size-4 shrink-0 text-pine" />
      <p className="text-sm leading-relaxed text-sage-ink">{text}</p>
    </div>
  );
}

function FlowStep({
  marker,
  label,
  tone,
  children,
}: {
  marker: React.ReactNode;
  label: string;
  tone: "pine" | "slate" | "lime";
  children: React.ReactNode;
}) {
  const toneClass = {
    pine: "border-pine/25 bg-paper-raised",
    slate: "border-slate-info/25 bg-paper-raised",
    lime: "border-chart-2/40 bg-paper-raised",
  }[tone];
  const badgeClass = {
    pine: "bg-pine/10 text-pine",
    slate: "bg-slate-info/10 text-slate-info",
    lime: "bg-chart-2/15 text-[color:var(--lime-ink)]",
  }[tone];
  return (
    <section className={cn("overflow-hidden rounded-2xl border shadow-sm", toneClass)}>
      <header className={cn("flex items-center gap-2.5 border-b border-border/70 px-4 py-3")}>
        <span className={cn("inline-flex size-7 items-center justify-center rounded-lg", badgeClass)}>
          {marker}
        </span>
        <span className="font-cal text-sm font-bold tracking-wide text-foreground">{label}</span>
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Connector() {
  return (
    <div className="flex justify-center py-1" aria-hidden>
      <svg width="2" height="28" className="text-border">
        <line x1="1" y1="0" x2="1" y2="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
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

function TestView({ draft }: { draft: WorkflowDraft }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-paper-raised px-4 py-3">
        <h2 className="font-cal text-sm font-bold text-foreground">Test this automation</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Evaluate your conditions against the workspace&apos;s most recently updated candidate. No actions run, nothing is saved.
        </p>
      </div>
      <DryRunPanel
        trigger={draft.trigger}
        conditions={draft.conditions ?? []}
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
