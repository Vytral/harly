"use client";

import { useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import { CheckCircleIcon, XCircleIcon } from "@/components/ui/icons/phosphor";

import type { Conditions, Trigger } from "../schema";
import { describeConditions, describeTrigger } from "./preview";

/**
 * The Test tab's panel: runs a dry-run (T5) against a sample candidate via
 * `dryRunWorkflowAction`. Shows the evaluated condition tree (each node matched
 * or not) so the recruiter understands WHY it matched, not just whether.
 */
export function DryRunPanel({
  trigger,
  conditions,
  candidates,
  preview,
  run,
}: {
  trigger: Trigger;
  conditions: Conditions;
  candidates: Array<{ id: string; name: string; email: string }>;
  preview: (input: { trigger: Trigger; candidateId?: string }) => Promise<{
    ok: boolean;
    error?: string;
    payload?: Record<string, unknown>;
  }>;
  run: (input: { trigger: Trigger; conditions: Conditions; candidateId?: string }) => Promise<{
    ok: boolean;
    error?: string;
    matched?: boolean;
    evaluated?: Array<{ text: string; matched: boolean }>;
  }>;
}) {
  const [pending, startRun] = useTransition();
  const [candidateId, setCandidateId] = useState(candidates[0]?.id ?? "");
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<{
    matched: boolean;
    evaluated: Array<{ text: string; matched: boolean }>;
    error?: string;
  } | null>(null);

  function handleRun() {
    startRun(async () => {
      const r = await run({ trigger, conditions, candidateId: candidateId || undefined });
      if (r.ok) {
        setResult({ matched: Boolean(r.matched), evaluated: r.evaluated ?? [], error: r.error });
      } else {
        setResult({ matched: false, evaluated: [], error: r.error ?? "Could not run dry-run." });
      }
    });
  }

  function handlePreview() {
    startRun(async () => {
      const r = await preview({ trigger, candidateId: candidateId || undefined });
      setPayload(r.ok ? r.payload ?? null : { error: r.error ?? "Could not preview payload." });
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-paper-raised p-5 shadow-sm">
      <div className="space-y-1.5 text-sm">
        <p className="text-ink-soft">
          <span className="font-semibold text-foreground">When</span> {describeTrigger(trigger)}.
        </p>
        <p className="text-ink-soft">
          <span className="font-semibold text-foreground">If</span> {describeConditions(conditions)}.
        </p>
        <p className="text-ink-soft">
          <span className="font-semibold text-foreground">Then</span> the actions would run (skipped in dry-run).
        </p>
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={pending}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
          pending ? "bg-kraft text-ink-soft" : "bg-pine text-white hover:bg-pine-strong active:scale-[0.97]",
        )}
      >
        {pending ? "Testing…" : "Test conditions"}
      </button>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-ink-soft" htmlFor="dry-run-candidate">Test candidate</label>
        <select id="dry-run-candidate" value={candidateId} onChange={(event) => setCandidateId(event.target.value)} className="min-w-56 rounded-lg border border-border bg-paper px-2.5 py-1.5 text-xs text-foreground">
          <option value="">Most recently updated</option>
          {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.email}</option>)}
        </select>
        <button type="button" onClick={handlePreview} disabled={pending} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-kraft disabled:opacity-50">
          Preview event payload
        </button>
      </div>
      {payload && <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-border bg-kraft/30 p-3 text-[11px] leading-relaxed text-ink-soft">{JSON.stringify(payload, null, 2)}</pre>}

      {result && (
        <div className="mt-4 space-y-2.5">
          {result.error ? (
            <div className="rounded-lg border border-rust/30 bg-rust/5 px-3 py-2.5 text-sm text-rust">
              {result.error}
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium",
                  result.matched
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-ink-soft/30 bg-kraft/40 text-ink-soft",
                )}
              >
                {result.matched ? <CheckCircleIcon className="size-4" /> : <XCircleIcon className="size-4" />}
                {result.matched ? "Conditions would match — the workflow would run." : "Conditions would not match — the workflow would skip."}
              </div>
              {result.evaluated.length > 0 && (
                <div className="space-y-1 rounded-lg border border-border bg-kraft/20 p-3">
                  {result.evaluated.map((e, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "inline-flex size-4 shrink-0 items-center justify-center rounded-full",
                          e.matched ? "bg-success/20 text-success" : "bg-rust/15 text-rust",
                        )}
                      >
                        {e.matched ? "✓" : "✕"}
                      </span>
                      <span className="font-mono text-ink-soft">{e.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
