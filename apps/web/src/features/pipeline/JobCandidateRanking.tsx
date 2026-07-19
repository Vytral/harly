"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Users } from "lucide-react";
import { toast } from "sonner";

import { bulkGenerateAiEvaluationsForJobAction } from "@/features/candidates/ai-actions";
import type { PipelineApplication, PipelineStage } from "@/features/pipeline/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/UserAvatar";
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
  const scored = activeApplications.filter((application) => application.aiScore != null).length;
  const unscored = activeApplications.length - scored;

  async function rankUnscored() {
    if (unscored === 0) return;

    setRanking(true);
    let totalSucceeded = 0;
    let totalFailed = 0;
    try {
      for (let guard = 0; guard < 100; guard++) {
        const result = await bulkGenerateAiEvaluationsForJobAction({ jobId });
        if (!result.success) {
          toast.error(
            result.reason === "not_configured"
              ? "Connect an AI provider in Settings → AI first."
              : result.error ?? "Could not rank applicants.",
          );
          return;
        }

        totalSucceeded += result.succeeded;
        totalFailed += result.failed;
        if (result.remaining === 0) break;
      }

      if (totalSucceeded > 0 || totalFailed > 0) {
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

  return (
    <Card className="bg-muted/20">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">AI candidate ranking</p>
            <p className="truncate text-xs text-muted-foreground">
              Active applicants for {jobTitle} · {scored} scored · {unscored} unscored
            </p>
          </div>
          {aiConfigured ? (
            <Button size="sm" onClick={rankUnscored} disabled={ranking || unscored === 0}>
              <Users className={cn("size-4", ranking && "animate-pulse motion-reduce:animate-none")} />
              {ranking ? "Ranking…" : unscored === 0 ? "All scored" : "Rank unscored"}
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/ai">Set up AI</Link>
            </Button>
          )}
        </div>

        {activeApplications.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">No active applicants</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Active applications for this job will appear here for ranking.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border bg-card">
            {activeApplications.map((application, index) => {
              const recommendation = application.aiRecommendation;
              const meta = recommendation
                ? RECOMMENDATION_META[recommendation]
                : null;
              const hasEvaluation = application.aiScore != null && meta;

              return (
                <div
                  key={application.id}
                  className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/40 sm:px-4"
                >
                  <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                    {hasEvaluation ? index + 1 : "–"}
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
                      <span className="block truncate text-xs text-muted-foreground">
                        {application.candidateHeadline ??
                          stageNameById.get(application.currentStageId) ??
                          application.candidateEmail}
                      </span>
                    </span>
                  </Link>

                  {application.aiSummary ? (
                    <p className="hidden max-w-md flex-1 truncate text-xs text-muted-foreground lg:block">
                      {application.aiSummary}
                    </p>
                  ) : null}

                  <div className="flex shrink-0 items-center gap-2">
                    {hasEvaluation && meta ? (
                      <>
                        <Badge className={cn("hidden text-[11px] sm:inline-flex", meta.className)}>
                          {meta.label}
                        </Badge>
                        <span
                          className={cn(
                            "text-base font-semibold tabular-nums",
                            scoreTone(application.aiScore),
                          )}
                          title={
                            application.aiUsedResume
                              ? "Based on resume + profile"
                              : "Profile only. No readable resume"
                          }
                        >
                          {application.aiScore}
                        </span>
                      </>
                    ) : (
                      <Badge variant="outline" className="font-normal text-muted-foreground">
                        Not scored
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {scored > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="size-3.5" />
            Scores use each candidate&apos;s resume and application answers against this job.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
