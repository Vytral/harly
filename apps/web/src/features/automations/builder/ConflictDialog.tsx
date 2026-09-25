"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { diffGraphSummaries, summarizeGraph, type GraphDiffLine } from "./graph-diff";
import type { WorkflowGraphV2 } from "../definition/schema-v2";

export function ConflictDialog({
  open,
  localGraph,
  serverGraph,
  message,
  onCompare,
  onCopy,
  onDismiss,
  comparing,
  lines,
}: {
  open: boolean;
  localGraph: WorkflowGraphV2;
  serverGraph: WorkflowGraphV2 | null;
  message: string;
  onCompare: () => void;
  onCopy: () => void;
  onDismiss: () => void;
  comparing: boolean;
  lines: GraphDiffLine[] | null;
}) {
  const shown =
    lines ??
    (serverGraph
      ? diffGraphSummaries(summarizeGraph(localGraph), summarizeGraph(serverGraph))
      : []);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>This draft was saved elsewhere</DialogTitle>
          <DialogDescription>
            {message || "Someone else saved this recipe while you were editing. We will not overwrite their version."}
          </DialogDescription>
        </DialogHeader>
        {shown.length > 0 ? (
          <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-soft-kraft/30 p-3">
            {shown.map((line) => (
              <li key={`${line.id}:${line.message}`} className="text-xs text-foreground">
                {line.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-soft-ink">
            Compare with the server copy, or copy your edits into a new recipe.
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-soft-ink transition-colors duration-150 ease-out hover:text-foreground"
          >
            Keep editing
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCompare}
              disabled={comparing}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 ease-out hover:bg-soft-kraft disabled:opacity-60"
            >
              {comparing ? "Comparing…" : "Compare with server"}
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors duration-150 ease-out hover:bg-foreground/90"
            >
              Copy my edits to a new recipe
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
