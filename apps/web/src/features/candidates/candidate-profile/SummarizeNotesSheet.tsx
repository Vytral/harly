"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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
  { labelKey: "strongYes" | "yes" | "maybe" | "no"; className: string }
> = {
  strong_yes: { labelKey: "strongYes", className: "bg-primary/10 text-primary" },
  yes: { labelKey: "yes", className: "bg-primary/10 text-primary" },
  maybe: { labelKey: "maybe", className: "bg-clay/15 text-clay" },
  no: { labelKey: "no", className: "bg-destructive/10 text-destructive" },
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
  const t = useTranslations("features.candidates.summarizeNotesSheet");
  const ilt = useTranslations("labels.interviews");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [rawNotes, setRawNotes] = useState("");
  const [summary, setSummary] = useState<InterviewNotesSummary | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  function decisionLabel(decision: string) {
    const meta = DECISION_META[decision as keyof typeof DECISION_META];
    return meta ? t(`decisions.${meta.labelKey}`) : decision;
  }

  function summarize() {
    if (!rawNotes.trim()) {
      toast.error(t("enterNotesFirst"));
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
    const body = [
      t("noteTitle", {
        title: interview.title ?? interviewTypeLabel(interview.type, ilt),
      }),
      "",
      summary.executiveSummary,
      "",
      t("positiveSignals"),
      ...summary.positiveSignals.map((s) => `• ${s}`),
      ...(summary.concerns.length > 0
        ? ["", t("concerns"), ...summary.concerns.map((c) => `• ${c}`)]
        : []),
      "",
      t("noteSuggestedDecision", {
        decision: decisionLabel(summary.suggestedDecision),
      }),
    ].join("\n");

    startSaveTransition(async () => {
      const result = await createCandidateNote({
        candidateId,
        workspaceId,
        body,
      });
      if (!result.success) {
        toast.error(result.error ?? t("saveError"));
        return;
      }
      toast.success(t("summarySaved"));
      setOpen(false);
      (router as { refresh?: () => void }).refresh?.();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} mobilePresentation="bottom-on-mobile">
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <DrawerLayout
        title={t("title")}
        description={`${interview.title ?? interviewTypeLabel(interview.type, ilt)} · ${interview.jobTitle}`}
        footer={
          summary ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isSaving}
              onClick={saveAsNote}
            >
              {isSaving ? t("saving") : t("saveAsNote")}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {!summary ? (
            <>
              <Textarea
                placeholder={t("notesPlaceholder")}
                className="min-h-[180px] resize-y text-base sm:text-sm"
                value={rawNotes}
                onChange={(e) => setRawNotes(e.target.value)}
                disabled={isPending}
              />
              <AiButton
                size="sm"
                onClick={summarize}
                loading={isPending}
                loadingText={t("summarizing")}
                disabled={!rawNotes.trim()}
              >
                {t("summarizeWithAi")}
              </AiButton>
            </>
          ) : (
            <div className="space-y-5 text-sm">
              <div>
                <p className="mb-1.5 font-medium text-foreground">
                  {t("summary")}
                </p>
                <p className="leading-relaxed text-muted-foreground">
                  {summary.executiveSummary}
                </p>
              </div>

              {summary.positiveSignals.length > 0 ? (
                <div>
                  <p className="mb-1.5 font-medium text-foreground">
                    {t("positiveSignals")}
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
                  <p className="mb-1.5 font-medium text-foreground">
                    {t("concerns")}
                  </p>
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
                <p className="font-medium text-foreground">
                  {t("suggestedDecision")}
                </p>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    DECISION_META[summary.suggestedDecision]?.className,
                  )}
                >
                  {decisionLabel(summary.suggestedDecision)}
                </span>
              </div>

              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setSummary(null)}
              >
                {t("editAndResummarize")}
              </button>
            </div>
          )}
        </div>
      </DrawerLayout>
    </Sheet>
  );
}
