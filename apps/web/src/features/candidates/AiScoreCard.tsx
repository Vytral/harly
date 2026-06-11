"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { generateAiEvaluationAction } from "@/features/candidates/ai-actions";
import type { CandidateAiEvaluationItem } from "@/features/candidates/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

const RECOMMENDATION_META = {
  strong_yes: { label: "Strong yes", className: "bg-primary/10 text-primary" },
  yes: { label: "Yes", className: "bg-primary/10 text-primary" },
  maybe: { label: "Maybe", className: "bg-clay/15 text-clay" },
  no: { label: "No", className: "bg-destructive/10 text-destructive" },
} as const;

function scoreTone(score: number) {
  if (score >= 60) return "text-primary";
  if (score >= 40) return "text-clay";
  return "text-destructive";
}

function ScoreRing({ score }: { score: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-muted"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className={cn("transition-[stroke-dashoffset] duration-700", scoreTone(score), "stroke-current")}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center text-base font-semibold tabular-nums",
          scoreTone(score),
        )}
      >
        {score}
      </span>
    </div>
  );
}

function GenerateButton({
  applicationId,
  hasEvaluation,
}: {
  applicationId: string;
  hasEvaluation: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await generateAiEvaluationAction({ applicationId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("AI evaluation ready");
      router.refresh();
    });
  }

  return (
    <Button
      size="sm"
      variant={hasEvaluation ? "ghost" : "default"}
      onClick={run}
      disabled={isPending}
      className={cn(hasEvaluation && "text-muted-foreground")}
    >
      {hasEvaluation ? (
        <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
      ) : (
        <Sparkles className={cn("size-4", isPending && "animate-pulse")} />
      )}
      {isPending ? "Scoring…" : hasEvaluation ? "Regenerate" : "Score with AI"}
    </Button>
  );
}

export function AiScoreCard({
  applications,
  evaluations,
  aiConfigured,
}: {
  applications: Array<{ id: string; jobTitle: string }>;
  evaluations: CandidateAiEvaluationItem[];
  aiConfigured: boolean;
}) {
  if (applications.length === 0) return null;

  if (!aiConfigured) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Sparkles className="size-4.5" strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-sm font-medium">AI candidate scoring</p>
              <p className="text-sm text-muted-foreground">
                Connect an AI provider to score candidates against each job.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/ai">Set up AI</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const byApplication = new Map(evaluations.map((e) => [e.applicationId, e]));

  return (
    <div className="space-y-3">
      {applications.map((application) => {
        const evaluation = byApplication.get(application.id);

        if (!evaluation) {
          return (
            <Card key={application.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="size-4.5" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{application.jobTitle}</p>
                    <p className="text-sm text-muted-foreground">
                      No AI evaluation yet for this application.
                    </p>
                  </div>
                </div>
                <GenerateButton
                  applicationId={application.id}
                  hasEvaluation={false}
                />
              </CardContent>
            </Card>
          );
        }

        const meta = RECOMMENDATION_META[evaluation.recommendation];

        return (
          <Card key={application.id}>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <ScoreRing score={evaluation.score} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{application.jobTitle}</p>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          meta.className,
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                      {evaluation.summary}
                    </p>
                  </div>
                </div>
                <GenerateButton applicationId={application.id} hasEvaluation />
              </div>

              {evaluation.criteria.length > 0 ? (
                <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {evaluation.criteria.map((criterion) => (
                    <div key={criterion.label}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[13px] font-medium">{criterion.label}</p>
                        <span
                          className={cn(
                            "text-xs font-semibold tabular-nums",
                            scoreTone(criterion.score),
                          )}
                        >
                          {criterion.score}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full bg-current transition-[width] duration-700",
                            scoreTone(criterion.score),
                          )}
                          style={{ width: `${criterion.score}%` }}
                        />
                      </div>
                      {criterion.evidence ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {criterion.evidence}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {evaluation.strengths.length > 0 || evaluation.gaps.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {evaluation.strengths.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Strengths
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {evaluation.strengths.map((item) => (
                          <li key={item} className="flex gap-2 text-sm">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {evaluation.gaps.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-clay">
                        Gaps
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {evaluation.gaps.map((item) => (
                          <li key={item} className="flex gap-2 text-sm">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-clay/60" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                <Badge variant="outline" className="font-normal">
                  {evaluation.modelId}
                </Badge>
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" />
                  {evaluation.usedResume
                    ? "Based on resume + profile"
                    : "Profile only — no readable resume"}
                </span>
                <span>
                  Updated <RelativeTime value={evaluation.updatedAt} />
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
