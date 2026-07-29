"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import { AiButton } from "@/components/ui/AiButton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { createCandidateNote } from "@/features/candidates/actions";
import { summarizeInterviewNotesAction } from "@/features/interviews/actions";
import {
  interviewTypeLabel,
  type CandidateInterviewItem,
} from "@/features/interviews/shared";
import type { InterviewNotesSummary } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

/** Mirrors AiScoreCard so a suggested decision reads the same everywhere. */
const DECISION_META: Record<
  "strong_yes" | "yes" | "maybe" | "no",
  { label: string; className: string }
> = {
  strong_yes: { label: "Strong yes", className: "bg-primary/10 text-primary" },
  yes: { label: "Yes", className: "bg-primary/10 text-primary" },
  maybe: { label: "Maybe", className: "bg-clay/15 text-clay" },
  no: { label: "No", className: "bg-destructive/10 text-destructive" },
};

export function SummarizeNotesSheet({
  interview,
  candidateId,
  workspaceId,
  trigger,
}: {
  interview: CandidateInterviewItem;
  candidateId: string;
  workspaceId: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [rawNotes, setRawNotes] = useState("");
  const [summary, setSummary] = useState<InterviewNotesSummary | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  function summarize() {
    if (!rawNotes.trim()) {
      toast.error("Enter some notes first.");
      return;
    }
    startTransition(async () => {
      const result = await summarizeInterviewNotesAction({
        interviewId: interview.id,
        rawNotes,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSummary(result.summary);
    });
  }

  function saveAsNote() {
    if (!summary) return;
    const decision = DECISION_META[summary.suggestedDecision];
    const body = [
      `Interview summary, ${interview.title ?? interviewTypeLabel(interview.type)}`,
      "",
      summary.executiveSummary,
      "",
      "Positive signals",
      ...summary.positiveSignals.map((s) => `• ${s}`),
      ...(summary.concerns.length > 0
        ? ["", "Concerns", ...summary.concerns.map((c) => `• ${c}`)]
        : []),
      "",
      `Suggested decision: ${decision?.label ?? summary.suggestedDecision}`,
    ].join("\n");

    startSaveTransition(async () => {
      const result = await createCandidateNote({
        candidateId,
        workspaceId,
        body,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not save note.");
        return;
      }
      toast.success("Summary saved as note");
      setOpen(false);
      (router as { refresh?: () => void }).refresh?.();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} mobilePresentation="bottom-on-mobile">
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <DrawerLayout
        title="Summarize interview notes"
        description={`${interview.title ?? interviewTypeLabel(interview.type)} · ${interview.jobTitle}`}
        footer={
          summary ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isSaving}
              onClick={saveAsNote}
            >
              {isSaving ? "Saving…" : "Save as note"}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {!summary ? (
            <>
              <Textarea
                placeholder="Paste your raw interview notes here — messy is fine."
                className="min-h-[180px] resize-y text-sm"
                value={rawNotes}
                onChange={(e) => setRawNotes(e.target.value)}
                disabled={isPending}
              />
              <AiButton
                size="sm"
                onClick={summarize}
                loading={isPending}
                loadingText="Summarizing"
                disabled={!rawNotes.trim()}
              >
                Summarize with AI
              </AiButton>
            </>
          ) : (
            <div className="space-y-5 text-sm">
              <div>
                <p className="mb-1.5 font-medium text-foreground">Summary</p>
                <p className="leading-relaxed text-muted-foreground">
                  {summary.executiveSummary}
                </p>
              </div>

              {summary.positiveSignals.length > 0 ? (
                <div>
                  <p className="mb-1.5 font-medium text-foreground">
                    Positive signals
                  </p>
                  <ul className="space-y-1 text-muted-foreground">
                    {summary.positiveSignals.map((s, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {summary.concerns.length > 0 ? (
                <div>
                  <p className="mb-1.5 font-medium text-foreground">Concerns</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {summary.concerns.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive/60" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">Suggested decision</p>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    DECISION_META[summary.suggestedDecision]?.className,
                  )}
                >
                  {DECISION_META[summary.suggestedDecision]?.label ??
                    summary.suggestedDecision}
                </span>
              </div>

              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setSummary(null)}
              >
                Edit notes and re-summarize
              </button>
            </div>
          )}
        </div>
      </DrawerLayout>
    </Sheet>
  );
}
