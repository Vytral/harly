"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronUp, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

import { looksLikeRawJson, visibleIssues, type VisibleIssue } from "./validation-view";
import type { WorkflowGraphV2 } from "../definition/schema-v2";

export function ValidationPanel({
  graph,
  onSelect,
  compact = false,
  floating = true,
}: {
  graph: WorkflowGraphV2;
  onSelect: (nodeId: string) => void;
  compact?: boolean;
  floating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const issues = visibleIssues(graph);

  const openTransition = reduceMotion
    ? { duration: 0.12, ease: "linear" as const }
    : { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const };
  const closeTransition = reduceMotion
    ? { duration: 0.1, ease: "linear" as const }
    : { duration: 0.15, ease: [0.22, 1, 0.36, 1] as const };

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border bg-pure-snow/90 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 shadow-xs backdrop-blur-sm">
        <CheckCircle2 className="size-3.5 shrink-0" />
        <span>All paths connected</span>
      </div>
    );
  }

  const uniqueNodeIds = new Set(issues.map((i) => i.nodeId));
  const stepCount = uniqueNodeIds.size;
  const issuesText = `${issues.length} ${issues.length === 1 ? "issue" : "issues"} in ${stepCount} ${stepCount === 1 ? "step" : "steps"}`;

  // Non-floating presentation (e.g. mobile steps drawer)
  if (!floating) {
    return (
      <div className={cn("border-t border-hairline-c bg-warm-paper", compact ? "px-3 py-2.5" : "px-4 py-3")}>
        <div className="flex items-center gap-1.5 text-soft-ink">
          <AlertCircle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="font-chrome text-[11px] font-semibold uppercase tracking-wider">
            {issuesText}
          </p>
        </div>
        <ul className={cn("mt-2 space-y-1.5", compact && "max-h-32 overflow-y-auto")}>
          {issues.map((issue) => (
            <IssueRow key={`${issue.nodeId}:${issue.fieldPath}:${issue.message}`} issue={issue} onSelect={onSelect} />
          ))}
        </ul>
      </div>
    );
  }

  // Floating presentation on canvas
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {!open ? (
        <motion.button
          key="collapsed"
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          transition={closeTransition}
          className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-pure-snow/95 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 shadow-sm backdrop-blur-sm transition-all hover:border-amber-500/60 hover:bg-pure-snow hover:shadow-md"
        >
          <AlertCircle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{issuesText}</span>
          <ChevronUp className="size-3 shrink-0 text-soft-ink" />
        </motion.button>
      ) : (
        <motion.div
          key="expanded"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, filter: "blur(2px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, filter: "blur(2px)" }}
          transition={openTransition}
          className="w-80 rounded-2xl border border-border bg-pure-snow p-3 shadow-lg backdrop-blur-md sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-hairline-c pb-2">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <AlertCircle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="font-chrome text-xs font-semibold uppercase tracking-wider">
                {issuesText}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close issues panel"
              className="rounded-lg p-1 text-soft-ink transition-colors hover:bg-soft-kraft hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <ul className="mt-2.5 max-h-56 space-y-1.5 overflow-y-auto">
            {issues.map((issue) => (
              <IssueRow
                key={`${issue.nodeId}:${issue.fieldPath}:${issue.message}`}
                issue={issue}
                onSelect={(id) => {
                  onSelect(id);
                }}
              />
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function IssueRow({ issue, onSelect }: { issue: VisibleIssue; onSelect: (nodeId: string) => void }) {
  const message = looksLikeRawJson(issue.message)
    ? "Needs attention to configure fields"
    : issue.message;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(issue.nodeId)}
        className="group flex w-full flex-col rounded-lg border border-border/70 bg-warm-paper/60 p-2 text-left transition-colors hover:border-foreground/30 hover:bg-soft-kraft/60"
      >
        <div className="flex w-full items-center justify-between gap-1.5">
          <span className="truncate text-[11px] font-semibold text-foreground group-hover:text-foreground">
            {issue.title}
          </span>
          <span
            className={cn(
              "font-chrome shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
              issue.category === "connection"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "bg-soft-kraft text-soft-ink",
            )}
          >
            {issue.category === "connection" ? "Connection" : "Config"}
          </span>
        </div>
        <span className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
          {message}
        </span>
      </button>
    </li>
  );
}
