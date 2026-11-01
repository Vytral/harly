"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown as CaretDown, FileText, Users } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { bulkGenerateAiEvaluationsForJobAction } from "@/features/candidates/ai-actions";
import type { PipelineApplication, PipelineStage } from "@/features/pipeline/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { RULES_EVALUATION_VERSION } from "@/lib/evaluation/version";
import { cn } from "@/lib/utils";
import { scoreBand } from "@/lib/evaluation/score-band";

const RECOMMENDATION_META = {
  strong_yes: { label: "Strong yes", className: "bg-sage-wash text-success-olive" },
  yes: { label: "Yes", className: "bg-sage-wash text-success-olive" },
  maybe: { label: "Maybe", className: "bg-warning/10 text-warning" },
  no: { label: "No", className: "bg-destructive/10 text-destructive" },
} as const;

function needsEvaluation(application: PipelineApplication) {
  return (
    application.aiScore == null ||
    (application.evaluationSource === "rules" &&
      application.evaluationEngineVersion?.split(":")[0] !== RULES_EVALUATION_VERSION)
  );
}

function scoreTone(score: number) {
  switch (scoreBand(score)) {
    case "strong":
      return "text-success-olive";
    case "good":
      return "text-[color-mix(in_oklab,var(--success-olive)_70%,var(--warning-clay))]";
    case "mixed":
      return "text-warning-clay";
    default:
      return "text-destructive";
  }
}

type JobCandidateRankingProps = {
  jobId: string;
  jobTitle: string;
  applications: PipelineApplication[];
  stages: PipelineStage[];
  aiConfigured: boolean;
};

export function JobCandidateRanking({
  jobId,
  jobTitle,
  applications,
  stages,
  aiConfigured,
}: JobCandidateRankingProps) {
  const router = useRouter();
  const [ranking, setRanking] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const stageNameById = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage.name])),
    [stages],
  );
  const activeApplications = useMemo(
    () =>
      applications
        .filter((application) => application.status === "active")
        .slice()
        .sort((first, second) => {
          const firstScore = first.aiScore ?? -1;
          const secondScore = second.aiScore ?? -1;
          return secondScore - firstScore;
        }),
    [applications],
  );
  const scored = activeApplications.filter((application) => !needsEvaluation(application)).length;
  const unscored = activeApplications.filter(needsEvaluation).length;
  const scoredRankById = useMemo(
    () =>
      new Map(
        activeApplications
          .filter((application) => !needsEvaluation(application))
          .map((application, index) => [application.id, index + 1]),
      ),
    [activeApplications],
  );

  async function rankUnscored() {
    if (unscored === 0) return;

    setRanking(true);
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalFellBack = 0;
    try {
      for (let guard = 0; guard < 100; guard++) {
        const result = await bulkGenerateAiEvaluationsForJobAction({ jobId });
        if (!result.success) {
          toast.error(
            result.reason === "not_configured"
              ? "Automatic evaluation is unavailable right now."
              : result.error ?? "Could not rank applicants.",
          );
          return;
        }

        totalSucceeded += result.succeeded;
        totalFailed += result.failed;
        totalFellBack += result.fellBack;
        // Rules-scored rows still count as "unscored" for AI, so another round
        // would re-score the same people. Stop and say so instead.
        if (result.remaining === 0 || result.succeeded === 0 || result.fellBack > 0) break;
      }

      if (totalFellBack > 0) {
        toast.warning(
          `${totalFellBack} of ${totalSucceeded} scored with Harly's built-in rules: the AI provider didn't return a usable answer. Try again in a moment.`,
        );
      } else if (totalSucceeded > 0 || totalFailed > 0) {
        toast.success(
          `Scored ${totalSucceeded} candidate${totalSucceeded === 1 ? "" : "s"}` +
            (totalFailed > 0 ? ` · ${totalFailed} failed` : ""),
        );
      } else {
        toast.info("Everyone is already scored.");
      }
      router.refresh();
    } catch {
      toast.error("Could not rank applicants. Try again shortly.");
    } finally {
      setRanking(false);
    }
  }

  /*
   * With nobody to rank, this panel used to occupy a full card explaining its
   * own emptiness , the board's first and largest element was AI apologising.
   * The pipeline already says the funnel is empty; AI staying silent is the
   * whole point of "optional guidance inside flows".
   */
  if (activeApplications.length === 0) return null;

  return (
    <Card className="bg-lime-wash/70 py-4 dark:bg-card">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {/* Framed as a suggestion from a colleague, not a verdict. */}
            <p className="text-[14px] font-medium text-near-ink">
              Harly can suggest an order
            </p>
            <p className="truncate text-[12px] text-soft-ink">
              {unscored === 0
                ? `All ${scored} active applicant${scored === 1 ? "" : "s"} rated. Yours to overrule.`
                : `${unscored} of ${activeApplications.length} not rated yet for ${jobTitle}.`}
            </p>
          </div>
          {unscored === 0 ? null : (
              <Button
                size="sm"
                variant="outline"
                onClick={rankUnscored}
                disabled={ranking}
              >
                <Users
                  className={cn(
                    "size-4",
                    ranking && "animate-pulse motion-reduce:animate-none",
                  )}
                />
                {ranking ? "Evaluating…" : aiConfigured ? "Rate the rest" : "Evaluate the rest"}
              </Button>
            )}
        </div>

        {/*
          Collapsed by default. The board is what this page is for, and a
          five-row machine-ranked list sitting permanently above it means the
          first thing a recruiter reads every morning is a score, not a person.
          Open it when you want a second opinion.
        */}
        <button
          type="button"
          onClick={() => setShowOrder((value) => !value)}
          aria-expanded={showOrder}
          className="flex items-center gap-1.5 rounded-md text-[13px] font-medium text-soft-ink transition-colors hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
        >
          <CaretDown
            className={cn(
              "size-3.5 transition-transform duration-200",
              !showOrder && "-rotate-90",
            )}
          />
          {showOrder ? "Hide suggested order" : "Show suggested order"}
        </button>

        {showOrder ? (
          <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-inner)] bg-pure-snow">
            {activeApplications.map((application) => {
              const recommendation = application.aiRecommendation;
              const meta = recommendation
                ? RECOMMENDATION_META[recommendation]
                : null;
              const hasEvaluation = application.aiScore != null && !needsEvaluation(application);

              return (
                <div
                  key={application.id}
                  className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-row-wash/60 sm:px-4"
                >
                  <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-soft-ink">
                    {hasEvaluation ? scoredRankById.get(application.id) : "–"}
                  </span>
                  <Link
                    href={`/dashboard/candidates/${application.candidateId}`}
                    className="flex min-w-0 flex-1 items-center gap-2.5"
                  >
                    <UserAvatar
                      name={`${application.candidateFirstName} ${application.candidateLastName}`}
                      src={application.candidateAvatarUrl}
                      fallbackSrcs={application.candidateAvatarFallbackSrcs}
                      size="sm"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {application.candidateFirstName} {application.candidateLastName}
                      </span>
                      <span className="block truncate text-xs text-soft-ink">
                        {application.candidateHeadline ??
                          stageNameById.get(application.currentStageId) ??
                          application.candidateEmail}
                      </span>
                    </span>
                  </Link>

                  {application.aiSummary ? (
                    <p className="hidden max-w-md flex-1 truncate text-xs text-soft-ink lg:block">
                      {application.aiSummary}
                    </p>
                  ) : null}

                  <div className="flex shrink-0 items-center gap-2">
                    {hasEvaluation && application.aiScore != null ? (
                      <>
                        {meta ? (
                          <Badge className={cn("hidden text-[11px] sm:inline-flex", meta.className)}>
                            {meta.label}
                          </Badge>
                        ) : null}
                        <span
                          className={cn(
                            "text-base font-semibold tabular-nums",
                            scoreTone(application.aiScore),
                          )}
                          title={`${application.evaluationSource === "rules" ? `Harly Algorithm ${application.evaluationEngineVersion ?? "rules"}` : "Automatic evaluation"}. ${application.aiUsedResume ? "Based on resume + profile" : "Profile only. No readable resume"}`}
                        >
                          {application.aiScore}
                        </span>
                      </>
                    ) : (
                      <Badge variant="outline" className="font-normal text-muted-foreground">
                        Not evaluated
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {showOrder && scored > 0 ? (
          <p className="flex items-center gap-1.5 text-[12px] text-soft-ink">
            <FileText className="size-3.5 shrink-0" />
            Based on each candidate&apos;s resume and answers against this job.
            Harly can be wrong , you decide.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
