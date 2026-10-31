import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * "Hiring progress" for the job editor rail: how many of the people who applied
 * are still in play. Lime bar on the lime-wash track (the progress token pair).
 */
export function JobHiringProgress({
  jobId,
  applicants,
  active,
  newThisWeek,
}: {
  jobId: string;
  applicants: number;
  active: number;
  newThisWeek: number;
}) {
  const percent = applicants > 0 ? Math.round((active / applicants) * 100) : 0;

  return (
    <Card className="gap-3 bg-card-inset py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center justify-between gap-2">
          Hiring progress
          <span className="tabular-nums text-[13px] font-medium text-soft-ink">{percent}%</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 px-4">
        <div
          role="progressbar"
          aria-label="Candidates still active"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 overflow-hidden rounded-full bg-lime-wash"
        >
          <div
            className="h-full rounded-full bg-chartreuse-signal transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out)]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-[12.5px] text-soft-ink">
          <span className="font-semibold tabular-nums text-near-ink">{active}</span> of{" "}
          <span className="tabular-nums">{applicants}</span>{" "}
          {applicants === 1 ? "candidate" : "candidates"} still active
          {newThisWeek > 0 ? ` · ${newThisWeek} new this week` : ""}
        </p>
        <Link
          href={`/dashboard/pipeline?jobId=${jobId}` as Route}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-near-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
        >
          Open pipeline
          <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
