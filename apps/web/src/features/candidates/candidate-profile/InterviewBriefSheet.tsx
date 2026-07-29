"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BrainCircuit } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { AiButton } from "@/components/ui/AiButton";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { generateInterviewBriefAction } from "@/features/interviews/actions";
import {
  interviewTypeLabel,
  type CandidateInterviewItem,
} from "@/features/interviews/shared";
import type { InterviewBrief } from "@/lib/ai/schemas";

export function InterviewBriefSheet({
  interview,
  trigger,
}: {
  interview: CandidateInterviewItem;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [brief, setBrief] = useState<InterviewBrief | null>(
    interview.briefContent ?? null,
  );

  function generate() {
    startTransition(async () => {
      const result = await generateInterviewBriefAction({
        interviewId: interview.id,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setBrief(result.brief);
      (router as { refresh?: () => void }).refresh?.();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} mobilePresentation="bottom-on-mobile">
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <DrawerLayout
        title="Interview Brief"
        description={`${interview.title ?? interviewTypeLabel(interview.type)} · ${interview.jobTitle}`}
        footer={
          <AiButton
            size="sm"
            variant={brief ? "outline" : "default"}
            onClick={generate}
            loading={isPending}
            loadingText="Generating"
          >
            {brief ? "Regenerate" : "Generate Brief"}
          </AiButton>
        }
      >
        {brief ? (
          <div className="space-y-5 text-sm">
            <div>
              <p className="mb-1.5 font-medium text-foreground">
                Candidate summary
              </p>
              <p className="leading-relaxed text-muted-foreground">
                {brief.candidateSummary}
              </p>
            </div>

            {brief.keyAreasToProbe.length > 0 ? (
              <div>
                <p className="mb-1.5 font-medium text-foreground">
                  Key areas to probe
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  {brief.keyAreasToProbe.map((area, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                      {area}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {brief.suggestedQuestions.length > 0 ? (
              <div>
                <p className="mb-1.5 font-medium text-foreground">
                  Suggested questions
                </p>
                <ol className="space-y-2 text-muted-foreground">
                  {brief.suggestedQuestions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-4 shrink-0 tabular-nums text-muted-foreground/50">
                        {i + 1}.
                      </span>
                      {q}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {brief.redFlags.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                <div className="mb-1.5 flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2} />
                  Watch for
                </div>
                <ul className="space-y-1 text-amber-700/90 dark:text-amber-400/80">
                  {brief.redFlags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-400" />
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <BrainCircuit className="size-5" strokeWidth={1.8} />
            </span>
            <p className="max-w-[240px] text-sm text-muted-foreground">
              A brief pulls this candidate&apos;s resume and answers into
              context, suggested questions, and areas to probe. Nothing is sent
              to the candidate.
            </p>
          </div>
        )}
      </DrawerLayout>
    </Sheet>
  );
}
