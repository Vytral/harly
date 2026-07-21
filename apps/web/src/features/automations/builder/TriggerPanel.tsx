"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import type { Trigger } from "../schema";
import { WORKFLOW_EVENTS } from "../schema";
import { triggerMeta } from "./catalog";

/**
 * The WHEN panel: pick the trigger event from a visual grid, and optionally add
 * a trigger.filter (key=value equality, AND-ed) to narrow which emissions fire.
 * The filter is a cheap pre-check the dispatcher runs before creating a run.
 */
export function TriggerPanel({
  value,
  onChange,
}: {
  value: Trigger;
  onChange: (t: Trigger) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const meta = triggerMeta(value.event);

  const filterEntries = Object.entries(value.filter ?? {});

  function setFilterEntry(key: string, val: string) {
    const next = { ...value.filter };
    if (val === "") delete next[key];
    else next[key] = val;
    onChange({ ...value, filter: Object.keys(next).length ? next : undefined });
  }

  return (
    <div className="space-y-4">
      {/* Current event — click to swap */}
      <button
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
          pickerOpen ? "border-pine/30 bg-sage/40" : "border-border bg-kraft/30 hover:bg-kraft/60",
        )}
      >
        <span className="flex items-center gap-3">
          <ToneIcon tone={meta.tone} />
          <span>
            <span className="block text-sm font-semibold text-foreground">{meta.label}</span>
            <span className="block text-xs text-ink-soft">{meta.blurb}</span>
          </span>
        </span>
        <span className="text-xs font-medium text-ink-soft">{pickerOpen ? "Done" : "Change"}</span>
      </button>

      {pickerOpen && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {WORKFLOW_EVENTS.map((event) => {
            const m = triggerMeta(event);
            const active = value.event === event;
            return (
              <button
                key={event}
                type="button"
                onClick={() => {
                  onChange({ event, filter: value.filter });
                  setPickerOpen(false);
                }}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all",
                  active ? "border-pine/40 bg-sage/50" : "border-border bg-paper-raised hover:border-pine/20 hover:bg-kraft/40",
                )}
              >
                <ToneIcon tone={m.tone} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{m.label}</span>
                  <span className="block truncate text-xs text-ink-soft">{m.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Trigger filter */}
      <div className="rounded-xl border border-border bg-kraft/20 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Run only when</span>
          <button
            type="button"
            onClick={() => setFilterEntry(`key${filterEntries.length}`, "")}
            className="text-xs font-medium text-pine hover:underline"
          >
            + add filter
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          Narrow the trigger to emissions where these payload fields match. Leave empty to run on every event.
        </p>
        <div className="mt-3 space-y-2">
          {filterEntries.length === 0 && (
            <p className="text-xs italic text-ink-soft/70">No filter — runs on every matching event.</p>
          )}
          {filterEntries.map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <input
                value={key}
                onChange={(e) => {
                  const v = String(val);
                  // Re-key: remove old, add new.
                  const next = { ...value.filter };
                  delete next[key];
                  next[e.target.value] = v;
                  onChange({ ...value, filter: next });
                }}
                placeholder="field"
                className="h-8 w-[40%] rounded-md border border-border bg-paper-raised px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-pine/30"
              />
              <span className="text-xs text-ink-soft">=</span>
              <input
                value={String(val)}
                onChange={(e) => setFilterEntry(key, e.target.value)}
                placeholder="value"
                className="h-8 flex-1 rounded-md border border-border bg-paper-raised px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-pine/30"
              />
              <button
                type="button"
                onClick={() => setFilterEntry(key, "")}
                className="text-xs text-ink-soft hover:text-rust"
                aria-label={`Remove filter ${key}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Tone-tinted glyph for a trigger category. */
function ToneIcon({ tone }: { tone: "apply" | "stage" | "outcome" | "candidate" | "interview" | "job" }) {
  const cls = {
    apply: "bg-pine/10 text-pine",
    stage: "bg-chart-2/15 text-[color:var(--lime-ink)]",
    outcome: "bg-success/10 text-success",
    candidate: "bg-slate-info/10 text-slate-info",
    interview: "bg-clay/10 text-clay",
    job: "bg-rust/10 text-rust",
  }[tone];
  return (
    <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-lg", cls)}>
      <ToneGlyph tone={tone} />
    </span>
  );
}

function ToneGlyph({ tone }: { tone: "apply" | "stage" | "outcome" | "candidate" | "interview" | "job" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "size-4",
  };
  switch (tone) {
    case "apply":
      return (
        <svg {...common}><path d="M16 3h5v5" /><path d="M21 3l-7 7" /><path d="M3 21l6-6" /><rect x="3" y="3" width="11" height="11" rx="2" /></svg>
      );
    case "stage":
      return (
        <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
      );
    case "outcome":
      return (
        <svg {...common}><path d="M20 6L9 17l-5-5" /></svg>
      );
    case "candidate":
      return (
        <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
      );
    case "interview":
      return (
        <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 12l3 2 3-2" /></svg>
      );
    case "job":
      return (
        <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></svg>
      );
  }
}
