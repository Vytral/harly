"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { RelativeTime } from "@/lib/date-hydration";
import { toast } from "@/lib/notification-island/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { CheckCircleIcon, XCircleIcon, ClockIcon, ProhibitIcon, CaretDownIcon, WarningCircleIcon } from "@/components/ui/icons/phosphor";

import { cancelRunAction, getRunAction, listRunsAction, reassignRunApprovalAction, replayRunFromStepAction, resolveRunApprovalAction, resolveRunUncertainAction, retryRunAction } from "../actions";
import {
  AUTOMATION_LIFECYCLE_STAGE_META,
  runLifecycleStage,
} from "../lifecycle-status";
import { actionMeta } from "./catalog";
import { BuilderSelect } from "./inspector/BuilderSelect";
import type { SerializedRun, SerializedRunStep } from "./types";

/**
 * Run history for a workflow: the latest runs with status badges, each
 * expandable to its step timeline (action → result → duration → error).
 * Loads lazily on expand so the list stays cheap. Uses the server actions
 * (gated by automations:manage), not the REST API.
 */
export function RunsTimeline({
  workflowId,
  members,
}: {
  workflowId: string;
  members: Array<{ id: string; name: string; email?: string }>;
}) {
  const [runs, setRuns] = useState<SerializedRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startLoad] = useTransition();
  const t = useTranslations("features.automations.runsTimeline");

  useEffect(() => {
    startLoad(async () => {
      const r = await listRunsAction({ workflowId, limit: 20 });
      if (r.ok) setRuns(r.runs as SerializedRun[]);
      else setError(r.error ?? t("loadFailed"));
    });
  }, [workflowId, t]);

  if (pending && runs === null) {
    return <RunsListSkeleton />;
  }
  if (error) {
    return <p className="text-sm text-danger-rust">{error}</p>;
  }
  if (runs && runs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-pure-snow p-8 text-center">
        <p className="font-display text-sm font-semibold text-foreground">{t("emptyTitle")}</p>
        <p className="mt-1 text-xs text-soft-ink max-w-sm mx-auto">
          {t("emptyDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs?.map((run) => (
        <RunRow key={run.id} run={run} members={members} />
      ))}
    </div>
  );
}

function RunsListSkeleton() {
  const t = useTranslations("features.automations.runsTimeline");
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={reduceMotion ? { duration: 0.12, ease: "linear" } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-2"
      aria-label={t("loadingRuns")}
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-pure-snow px-4 py-3">
          <Skeleton className="h-5 w-16 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </motion.div>
  );
}

function RunRow({
  run,
  members,
}: {
  run: SerializedRun;
  members: Array<{ id: string; name: string; email?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<SerializedRunStep[] | null>(null);
  const [pending, startLoad] = useTransition();
  const t = useTranslations("features.automations.runsTimeline");
  const statusNames = statusNameMap(t);
  const logicalStatus = run.logicalStatus ?? run.status;

  function retry() {
    startLoad(async () => {
      const result = await retryRunAction(run.id);
      if (result.ok) window.location.reload();
    });
  }

  function cancel() {
    startLoad(async () => {
      const result = await cancelRunAction(run.id);
      if (result.ok) window.location.reload();
    });
  }

  function replayFrom(stepIndex: number) {
    startLoad(async () => {
      const result = await replayRunFromStepAction(run.id, stepIndex);
      if (result.ok) window.location.reload();
    });
  }

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

  const lifecycle = runLifecycleStage({
    logicalStatus,
    steps: steps ?? undefined,
  });

  return (
    <div className="rounded-xl border border-border bg-pure-snow">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-soft-kraft/30"
        aria-expanded={open}
      >
        <span className="flex shrink-0 flex-col items-start gap-1">
          <StatusBadge status={logicalStatus} />
          <span
            className="rounded-full bg-muted/60 px-2 py-px text-[10px] font-medium text-muted-foreground"
            title={lifecycle.reason}
          >
            {AUTOMATION_LIFECYCLE_STAGE_META[lifecycle.stage].label}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            <span className="text-soft-ink">{t("triggerLabel")}</span> {run.triggerEvent}
          </p>
          <p className="text-xs text-soft-ink">
            <RelativeTime value={run.startedAt} /> · {statusNames[logicalStatus] ?? logicalStatus}
          </p>
        </div>
        {run.error && <span className="truncate text-xs text-danger-rust">{run.error}</span>}
        <CaretDownIcon
          aria-hidden
          className={cn("size-3.5 shrink-0 text-soft-ink transition-transform", open && "rotate-180")}
        />
      </button>

      {(logicalStatus === "failed" || logicalStatus === "dead_letter" || logicalStatus === "running" || logicalStatus === "waiting") && (
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2">
          {logicalStatus === "running" || logicalStatus === "waiting" ? (
            <button type="button" onClick={cancel} disabled={pending} className="text-xs font-medium text-soft-ink hover:text-danger-rust disabled:opacity-50">
              {t("cancelRun")}
            </button>
          ) : (
            <button type="button" onClick={retry} disabled={pending} className="text-xs font-medium text-foreground hover:underline disabled:opacity-50">
              {t("retryRun")}
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <ExpandedSteps
            pending={pending}
            steps={steps}
            members={members}
            replayFrom={replayFrom}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ExpandedSteps({
  pending,
  steps,
  members,
  replayFrom,
}: {
  pending: boolean;
  steps: SerializedRunStep[] | null;
  members: Array<{ id: string; name: string; email?: string }>;
  replayFrom: (stepIndex: number) => void;
}) {
  const t = useTranslations("features.automations.runsTimeline");
  const reduceMotion = useReducedMotion();
  const openTransition = reduceMotion
    ? { duration: 0.12, ease: "linear" as const }
    : { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0, height: 0 } : { opacity: 0, height: 0, filter: "blur(2px)" }}
      animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }}
      exit={reduceMotion ? { opacity: 0, height: 0 } : { opacity: 0, height: 0, filter: "blur(2px)" }}
      transition={openTransition}
      className="overflow-hidden border-t border-border"
    >
      <div className="px-4 py-3">
        {pending && steps === null ? (
          <ol className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Skeleton className="mt-0.5 size-5 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </li>
            ))}
          </ol>
        ) : steps && steps.length > 0 ? (
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <motion.div
                key={step.id}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  ...openTransition,
                  delay: reduceMotion ? 0 : Math.min(i, 6) * 0.04,
                }}
              >
                <StepRow index={i} step={step} members={members} onReplay={() => replayFrom(step.stepIndex ?? i)} />
              </motion.div>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-soft-ink">{t("noStepsRecorded")}</p>
        )}
      </div>
    </motion.div>
  );
}

function StepRow({
  index,
  step,
  members,
  onReplay,
}: {
  index: number;
  step: SerializedRunStep;
  members: Array<{ id: string; name: string; email?: string }>;
  onReplay: () => void;
}) {
  const [decisionPending, startDecision] = useTransition();
  const t = useTranslations("features.automations.runsTimeline");
  const tl = useTranslations("labels.automations");
  const meta = actionMeta(step.actionType as never, tl);
  const duration = step.finishedAt
    ? `${Math.round(new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime())}ms`
    : "—";
  return (
    <li className="flex flex-wrap items-start gap-2.5">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-soft-kraft text-[10px] font-semibold text-soft-ink">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{meta?.label ?? step.actionType}</span>
          <span className="flex items-center gap-2 text-xs text-soft-ink">
            <StepStatus status={step.status} />
            {duration}
          </span>
        </div>
        {(step.status === "failed" || step.status === "uncertain") && (step.errorCode || isErrorResult(step.result)) && (
          <p className="mt-0.5 truncate text-xs text-danger-rust">
            {step.status === "uncertain"
              ? String(step.errorCode ?? t("uncertainFallback"))
              : String((step.result as { error?: unknown }).error ?? step.errorCode ?? t("stepFailedFallback"))}
          </p>
        )}
        {step.attemptCount && step.attemptCount > 1 ? (
          <p className="mt-0.5 text-[11px] text-soft-ink">{t("attempts", { count: step.attemptCount })}</p>
        ) : null}
      </div>
      {step.actionType === "approval" && step.status === "waiting" && step.nodeId ? (
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            disabled={decisionPending}
            onClick={() => startDecision(async () => {
              const result = await resolveRunApprovalAction({ runId: step.runId, nodeId: step.nodeId, decision: "approved" });
              if (result.ok) window.location.reload();
            })}
            className="rounded-md border border-success/30 px-2 py-1 text-[11px] font-medium text-success hover:bg-success/10 disabled:opacity-50"
          >
            {t("approve")}
          </button>
          <button
            type="button"
            disabled={decisionPending}
            onClick={() => startDecision(async () => {
              const result = await resolveRunApprovalAction({ runId: step.runId, nodeId: step.nodeId, decision: "rejected" });
              if (result.ok) window.location.reload();
            })}
            className="rounded-md border border-danger-rust/30 px-2 py-1 text-[11px] font-medium text-danger-rust hover:bg-danger-rust/10 disabled:opacity-50"
          >
            {t("reject")}
          </button>
        </div>
      ) : null}
      {step.actionType === "approval" && step.status === "waiting" && step.nodeId ? (
        <ApprovalReassignment step={step} members={members} />
      ) : null}
      {step.status === "uncertain" && step.nodeId ? (
        <UncertainResolution step={step} />
      ) : null}
      {step.actionType !== "approval" && step.status === "failed" && (
        <button type="button" onClick={onReplay} className="shrink-0 text-[11px] font-medium text-foreground hover:underline">{t("replay")}</button>
      )}
    </li>
  );
}

function ApprovalReassignment({
  step,
  members,
}: {
  step: SerializedRunStep;
  members: Array<{ id: string; name: string; email?: string }>;
}) {
  const currentIds = approvalActorIds(step.actionInput);
  const [selectedIds, setSelectedIds] = useState(() => {
    const available = new Set(members.map((member) => member.id));
    const retained = currentIds.filter((id) => available.has(id));
    return retained.length > 0 ? retained : members[0] ? [members[0].id] : [];
  });
  const [pending, startTransition] = useTransition();
  const t = useTranslations("features.automations.runsTimeline");
  if (members.length === 0 || !step.nodeId) return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <label className="sr-only" htmlFor={`reassign-${step.id}`}>{t("reassignApproval")}</label>
      <select
        id={`reassign-${step.id}`}
        multiple
        size={Math.min(3, members.length)}
        value={selectedIds}
        onChange={(event) => setSelectedIds(Array.from(event.target.selectedOptions, (option) => option.value))}
        disabled={pending}
        title={t("selectMembers")}
        className="max-w-36 rounded-md border border-border bg-warm-paper px-1.5 py-0.5 text-[11px] text-foreground disabled:opacity-50"
      >
        {members.map((member) => (
          <option key={member.id} value={member.id}>{member.name}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || selectedIds.length === 0}
        onClick={() => startTransition(async () => {
          const result = await reassignRunApprovalAction({
            runId: step.runId,
            nodeId: step.nodeId!,
            actorIds: selectedIds,
          });
          if (result.ok) {
            toast.success(t("reassigned"));
            window.location.reload();
          } else {
            toast.error(result.error ?? t("reassignFailed"));
          }
        })}
        className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-soft-ink hover:bg-soft-kraft disabled:opacity-50"
      >
        {t("reassign")}
      </button>
    </div>
  );
}

function approvalActorIds(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const value = (input as { eligibleActorIds?: unknown }).eligibleActorIds;
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
}

function UncertainResolution({ step }: { step: SerializedRunStep }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"succeeded" | "failed">("succeeded");
  const [note, setNote] = useState("");
  const [providerRef, setProviderRef] = useState("");
  const [outputJson, setOutputJson] = useState("");
  const [pending, startTransition] = useTransition();
  const t = useTranslations("features.automations.runsTimeline");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-md border border-danger-rust/30 px-2 py-1 text-[11px] font-medium text-danger-rust hover:bg-danger-rust/10"
        title={t("reconcileHint")}
      >
        {t("reconcile")}
      </button>
    );
  }

  return (
    <div className="basis-full rounded-lg border border-danger-rust/30 bg-danger-rust/5 p-2.5 text-xs">
      <p className="font-medium text-foreground">{t("unknownOutcome")}</p>
      <p className="mt-0.5 text-[11px] text-soft-ink">{t("unknownOutcomeHelp")}</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-[11px] text-soft-ink">
          {t("result")}
          <BuilderSelect
            value={decision}
            onChange={(event) => setDecision(event.target.value as "succeeded" | "failed")}
            disabled={pending}
            className="rounded-md border border-border bg-warm-paper px-2 py-1 text-xs text-foreground"
          >
            <option value="succeeded">{t("providerConfirmsSuccess")}</option>
            <option value="failed">{t("providerConfirmsFailure")}</option>
          </BuilderSelect>
        </label>
        <label className="grid gap-1 text-[11px] text-soft-ink">
          {t("providerReference")}
          <input
            value={providerRef}
            onChange={(event) => setProviderRef(event.target.value)}
            disabled={pending}
            placeholder={t("providerReferencePlaceholder")}
            maxLength={300}
            className="rounded-md border border-border bg-warm-paper px-2 py-1 text-xs text-foreground"
          />
        </label>
      </div>
      <label className="mt-2 grid gap-1 text-[11px] text-soft-ink">
        {t("reconciliationNote")}
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={pending}
          required
          minLength={3}
          maxLength={1_000}
          rows={2}
          placeholder={t("reconciliationNotePlaceholder")}
          className="resize-y rounded-md border border-border bg-warm-paper px-2 py-1 text-xs text-foreground"
        />
      </label>
      {decision === "succeeded" ? (
        <label className="mt-2 grid gap-1 text-[11px] text-soft-ink">
          {t("outputJson")}
          <textarea
            value={outputJson}
            onChange={(event) => setOutputJson(event.target.value)}
            disabled={pending}
            rows={2}
            placeholder='{"providerId":"…"}'
            className="resize-y rounded-md border border-border bg-warm-paper px-2 py-1 font-mono text-[11px] text-foreground"
          />
        </label>
      ) : null}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="rounded-md px-2 py-1 text-[11px] text-soft-ink hover:bg-soft-kraft disabled:opacity-50">{t("cancel")}</button>
        <button
          type="button"
          onClick={() => {
            if (note.trim().length < 3) {
              toast.error(t("noteTooShort"));
              return;
            }
            startTransition(async () => {
              const result = await resolveRunUncertainAction({
                runId: step.runId,
                nodeId: step.nodeId!,
                decision,
                note,
                providerRef,
                outputJson: decision === "succeeded" ? outputJson : undefined,
              });
              if (result.ok) {
                toast.success(t("reconciled"));
                window.location.reload();
              } else {
                toast.error(result.error ?? t("reconcileFailed"));
              }
            });
          }}
          disabled={pending}
          className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("saving") : t("recordAndResume")}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("features.automations.runsTimeline");
  const reduceMotion = useReducedMotion();
  const statusMap: Record<string, { icon: typeof ClockIcon; tone: StatusPillTone; label: string }> = {
    running: { icon: ClockIcon, tone: "info", label: t("statusBadges.running") },
    succeeded: { icon: CheckCircleIcon, tone: "success", label: t("statusBadges.succeeded") },
    failed: { icon: XCircleIcon, tone: "danger", label: t("statusBadges.failed") },
    skipped: { icon: ProhibitIcon, tone: "neutral", label: t("statusBadges.skipped") },
    dead_letter: { icon: XCircleIcon, tone: "danger", label: t("statusBadges.deadLetter") },
    cancelled: { icon: ProhibitIcon, tone: "neutral", label: t("statusBadges.cancelled") },
    waiting: { icon: ClockIcon, tone: "neutral", label: t("statusBadges.waiting") },
    retrying: { icon: ClockIcon, tone: "info", label: t("statusBadges.retrying") },
    completed_with_warnings: { icon: CheckCircleIcon, tone: "warning", label: t("statusBadges.completedWithWarnings") },
    stopped: { icon: ProhibitIcon, tone: "neutral", label: t("statusBadges.stopped") },
    uncertain: { icon: XCircleIcon, tone: "danger", label: t("statusBadges.uncertain") },
    queued: { icon: ClockIcon, tone: "neutral", label: t("statusBadges.queued") },
  };
  const selected = statusMap[status] ?? { icon: ClockIcon, tone: "neutral" as const, label: status };
  const Icon = selected.icon;
  const contentTransition = reduceMotion
    ? { duration: 0.12, ease: "linear" as const }
    : { duration: 0.15, ease: [0.22, 1, 0.36, 1] as const };
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={status}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        transition={contentTransition}
        className="inline-flex shrink-0"
      >
        <StatusPill tone={selected.tone} size="sm" icon={Icon}>
          {selected.label}
        </StatusPill>
      </motion.span>
    </AnimatePresence>
  );
}

function StepStatus({ status }: { status: SerializedRunStep["status"] }) {
  const t = useTranslations("features.automations.runsTimeline");
  if (status === "succeeded") return <CheckCircleIcon aria-label={t("stepStatus.succeeded")} className="size-4 text-success" />;
  if (status === "failed") return <XCircleIcon aria-label={t("stepStatus.failed")} className="size-4 text-danger-rust" />;
  if (status === "uncertain") return <WarningCircleIcon aria-label={t("stepStatus.uncertain")} className="size-4 text-danger-rust" />;
  if (status === "waiting") return <ClockIcon aria-label={t("stepStatus.waiting")} className="size-4 text-warning" />;
  if (status === "running") return <span aria-label={t("stepStatus.running")} className="text-status-quiet-ink">…</span>;
  return <span aria-label={t("stepStatus.noStatus")} className="text-soft-ink">–</span>;
}

type Translator = ReturnType<typeof useTranslations>;

/** Lowercase status names shown in the run header, keyed by the raw status id. */
function statusNameMap(t: Translator): Record<string, string> {
  return {
    running: t("statusNames.running"),
    succeeded: t("statusNames.succeeded"),
    failed: t("statusNames.failed"),
    dead_letter: t("statusNames.deadLetter"),
    skipped: t("statusNames.skipped"),
    cancelled: t("statusNames.cancelled"),
    waiting: t("statusNames.waiting"),
    retrying: t("statusNames.retrying"),
    completed_with_warnings: t("statusNames.completedWithWarnings"),
    stopped: t("statusNames.stopped"),
    uncertain: t("statusNames.uncertain"),
    queued: t("statusNames.queued"),
  };
}

/** Type guard: a failed step's result often carries `{ error: string }`. */
function isErrorResult(result: unknown): result is { error?: unknown } {
  return Boolean(result && typeof result === "object" && "error" in (result as Record<string, unknown>));
}
