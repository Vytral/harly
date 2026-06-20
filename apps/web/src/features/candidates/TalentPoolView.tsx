"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FileText, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";

import { bulkGenerateAiEvaluationsForJobAction } from "@/features/candidates/ai-actions";
import type { TalentPoolEntry } from "@/features/candidates/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { gravatarUrl } from "@/lib/gravatar";
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

export type TalentPoolJob = { id: string; title: string };

type TalentPoolViewProps = {
  jobs: TalentPoolJob[];
  selectedJobId: string | null;
  entries: TalentPoolEntry[];
  scored: number;
  unscored: number;
  aiConfigured: boolean;
};

export function TalentPoolView({
  jobs,
  selectedJobId,
  entries,
  scored,
  unscored,
  aiConfigured,
}: TalentPoolViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [ranking, setRanking] = useState(false);

  function selectJob(jobId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("jobId", jobId);
    startTransition(() => {
      router.replace(`/dashboard/talent-pool?${params.toString()}`);
    });
  }

  /**
   * Score every unscored applicant for the selected job. The server caps each
   * call at 25, so loop until `remaining` hits 0 — resumable and idempotent.
   */
  async function rankUnscored() {
    if (!selectedJobId) return;
    setRanking(true);
    let totalSucceeded = 0;
    let totalFailed = 0;
    try {
      // Hard ceiling on iterations as a safety net against a stuck loop.
      for (let guard = 0; guard < 100; guard++) {
        const result = await bulkGenerateAiEvaluationsForJobAction({
          jobId: selectedJobId,
        });
        if (!result.success) {
          if (result.reason === "not_configured") {
            toast.error("Connect an AI provider in Settings → AI first.");
          } else {
            toast.error(result.error);
          }
          break;
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
    } finally {
      setRanking(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="talent-pool-job" className="sr-only">
            Job
          </label>
          <select
            id="talent-pool-job"
            value={selectedJobId ?? ""}
            onChange={(event) => selectJob(event.target.value)}
            disabled={isPending}
            className="h-9 rounded-lg border bg-card px-3 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
          >
            {jobs.length === 0 ? (
              <option value="">No open jobs</option>
            ) : (
              <>
                {!selectedJobId ? <option value="">Select a job…</option> : null}
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </>
            )}
          </select>
          {selectedJobId ? (
            <span className="text-sm text-muted-foreground">
              {scored} scored · {unscored} unscored
            </span>
          ) : null}
        </div>

        {selectedJobId ? (
          aiConfigured ? (
            <Button
              size="sm"
              onClick={rankUnscored}
              disabled={ranking || unscored === 0}
            >
              <Sparkles className={cn("size-4", ranking && "animate-pulse")} />
              {ranking
                ? "Ranking…"
                : unscored === 0
                  ? "All scored"
                  : `Rank ${unscored} unscored with AI`}
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/ai">Set up AI</Link>
            </Button>
          )
        ) : null}
      </div>

      {!selectedJobId ? (
        <EmptyHint
          title="Pick a job to rank applicants"
          description="Talent Pool ranks each job's active applicants by AI fit score."
        />
      ) : entries.length === 0 ? (
        <EmptyHint
          title="No active applicants"
          description="Once candidates apply to this role, you can rank them here."
        />
      ) : (
        <Card className="gap-0 divide-y divide-border/60 overflow-hidden py-0">
          {entries.map((entry, index) => {
            const evaluation = entry.evaluation;
            const meta = evaluation
              ? RECOMMENDATION_META[evaluation.recommendation]
              : null;
            return (
              <div
                key={entry.applicationId}
                className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5"
              >
                <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                  {evaluation ? index + 1 : "–"}
                </span>

                <Link
                  href={`/dashboard/candidates/${entry.candidateId}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <UserAvatar
                    name={entry.fullName}
                    src={entry.email ? gravatarUrl(entry.email) : null}
                    size="lg"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {entry.fullName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {entry.headline ?? entry.currentStageName ?? entry.email}
                    </span>
                  </span>
                </Link>

                {evaluation ? (
                  <p className="hidden max-w-md flex-1 truncate text-sm text-muted-foreground lg:block">
                    {evaluation.summary}
                  </p>
                ) : null}

                <div className="flex shrink-0 items-center gap-3">
                  {evaluation && meta ? (
                    <>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          meta.className,
                        )}
                      >
                        {meta.label}
                      </span>
                      <span
                        className={cn(
                          "text-lg font-semibold tabular-nums",
                          scoreTone(evaluation.score),
                        )}
                        title={
                          evaluation.usedResume
                            ? "Based on resume + profile"
                            : "Profile only — no readable resume"
                        }
                      >
                        {evaluation.score}
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
        </Card>
      )}

      {entries.some((entry) => entry.evaluation) ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="size-3.5" />
          Scores reflect the candidate&apos;s resume and application answers
          against this job. Regenerate an individual score from the candidate
          profile.
        </p>
      ) : null}
    </div>
  );
}

function EmptyHint({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Users className="size-5" strokeWidth={1.6} />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
