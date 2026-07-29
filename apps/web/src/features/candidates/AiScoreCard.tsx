"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { generateAiEvaluationAction } from "@/features/candidates/ai-actions";
import { withKeyLock } from "@/lib/client-mutex";
import type { CandidateAiEvaluationItem } from "@/features/candidates/data";
import { AiButton } from "@/components/ui/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ClaudeLogo,
  GeminiLogo,
  OpenAiLogo,
  OpenRouterLogo,
  XaiLogo,
} from "@/components/ui/icons/brands";
import { HarlyAILogoMark } from "@/components/ui/icons/HarlyAILogoMark";
import { RelativeTime } from "@/lib/date-hydration";
import { formatModelLabel, type AiProviderId } from "@/lib/ai/providers";
import { cn } from "@/lib/utils";

const PROVIDER_LOGO: Record<
  AiProviderId,
  React.ComponentType<{ className?: string }>
> = {
  openai: OpenAiLogo,
  anthropic: ClaudeLogo,
  google: GeminiLogo,
  xai: XaiLogo,
  openrouter: OpenRouterLogo,
};

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

function ScoreRing({ score, compact = false }: { score: number; compact?: boolean }) {
  const radius = compact ? 19 : 26;
  const circumference = 2 * Math.PI * radius;
  const box = compact ? 48 : 64;
  return (
    <div className={cn("relative shrink-0", compact ? "size-12" : "size-16")}>
      <svg viewBox={`0 0 ${box} ${box}`} className={cn("-rotate-90", compact ? "size-12" : "size-16")}>
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-muted"
        />
        <circle
          cx={box / 2}
          cy={box / 2}
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
          "absolute inset-0 flex items-center justify-center font-semibold tabular-nums",
          compact ? "text-sm" : "text-base",
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
  aiConfigured,
}: {
  applicationId: string;
  hasEvaluation: boolean;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await withKeyLock(`application:${applicationId}`, () =>
        generateAiEvaluationAction({ applicationId }),
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(aiConfigured ? "AI evaluation ready" : "Automatic evaluation ready");
      (router as { refresh?: () => void }).refresh?.();
    });
  }

  return (
    <AiButton
      size="sm"
      variant={hasEvaluation ? "ghost" : "default"}
      onClick={run}
      loading={isPending}
      loadingText="Scoring"
    >
      {hasEvaluation ? "Regenerate" : aiConfigured ? "Score with AI" : "Evaluate automatically"}
    </AiButton>
  );
}

/** Top 2 highlights for the condensed card: strengths first, then gaps, then a
 * one-line summary fallback so the condensed card never renders empty. */
function topHighlights(evaluation: CandidateAiEvaluationItem): string[] {
  const picks = [...evaluation.strengths, ...evaluation.gaps].slice(0, 2);
  if (picks.length > 0) return picks;
  return evaluation.summary ? [evaluation.summary] : [];
}

export function AiScoreCard({
  applications,
  evaluations,
  aiConfigured,
  variant = "full",
  onViewDetailsAction,
}: {
  applications: Array<{ id: string; jobTitle: string }>;
  evaluations: CandidateAiEvaluationItem[];
  aiConfigured: boolean;
  /** "condensed" = score + verdict + top bullets, no scroll (Profile tab).
   * "full" = criteria bars + evidence + strengths/gaps (Evaluation tab). */
  variant?: "full" | "condensed";
  /** Condensed only , jumps the caller to the full breakdown (Evaluation tab). */
  onViewDetailsAction?: () => void;
}) {
  if (applications.length === 0) return null;

  const byApplication = new Map(evaluations.map((e) => [e.applicationId, e]));

  if (variant === "condensed") {
    return (
      <div className="space-y-2">
        {applications.map((application) => {
          const evaluation = byApplication.get(application.id);

          if (!evaluation) {
            return (
              <Card key={application.id} className="gap-0 py-0">
                <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <HarlyAILogoMark className="size-4" />
                    </span>
                    <p className="truncate text-sm text-muted-foreground">
                      No automatic evaluation yet for {application.jobTitle}.
                    </p>
                  </div>
                  <GenerateButton applicationId={application.id} hasEvaluation={false} aiConfigured={aiConfigured} />
                </CardContent>
              </Card>
            );
          }

          const meta = RECOMMENDATION_META[evaluation.recommendation];
          const highlights = topHighlights(evaluation);

          return (
            <Card key={application.id} className="gap-0 py-0">
              <CardContent className="flex items-center gap-3 px-4 py-3">
                <ScoreRing score={evaluation.score} compact />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{application.jobTitle}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", meta.className)}>
                      {meta.label}
                    </span>
                  </div>
                  {highlights.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {highlights.map((item) => (
                        <li key={item} className="flex gap-1.5 text-xs text-muted-foreground">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current opacity-60" />
                          <span className="line-clamp-1">{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {onViewDetailsAction ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground"
                    onClick={onViewDetailsAction}
                  >
                    View details
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {applications.map((application) => {
        const evaluation = byApplication.get(application.id);

        if (!evaluation) {
          return (
            <Card key={application.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                    <HarlyAILogoMark className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{application.jobTitle}</p>
                    <p className="text-sm text-muted-foreground">
                      No automatic evaluation yet for this application.
                    </p>
                  </div>
                </div>
                <GenerateButton
                  applicationId={application.id}
                  hasEvaluation={false}
                  aiConfigured={aiConfigured}
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
                    <GenerateButton applicationId={application.id} hasEvaluation aiConfigured={aiConfigured} />
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
                <Badge variant="outline" className="gap-1.5 font-normal">
                  {(() => {
                    const Logo = PROVIDER_LOGO[evaluation.provider as AiProviderId];
                    return Logo ? <Logo className="size-3.5" /> : null;
                  })()}
                  {evaluation.source === "rules" ? "Harly Algorithm · rules-v2" : formatModelLabel(evaluation.modelId)}
                </Badge>
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" />
                  {evaluation.usedResume
                    ? "Based on resume + profile"
                    : "Profile only. No readable resume"}
                </span>
                <span>
                  Updated <RelativeTime value={evaluation.updatedAt} />
                </span>
                {evaluation.evidenceCoverage != null ? (
                  <span>Evidence {evaluation.evidenceCoverage}%</span>
                ) : null}
                {evaluation.requiresHumanReview ? (
                  <Badge variant="outline" className="font-normal text-clay">
                    Human review required
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {evaluation.source === "rules"
                  ? "Evaluación automática basada en reglas y evidencia explícita. Revisa la información faltante y decide con criterio humano."
                  : "AI guidance only — review the evidence and make the hiring decision yourself. Do not use this score as the sole basis for a decision."}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
