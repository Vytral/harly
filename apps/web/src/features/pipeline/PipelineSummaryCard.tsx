import { getTranslations } from "next-intl/server";

import { cn } from "@/lib/utils";
import { getPipelineSummary } from "@/features/pipeline/data";
import { getWorkspaceContext } from "@/features/workspaces/context";

/**
 * Pipeline health, as a single line of numbers above the board.
 *
 * Was a card with a brain-circuit icon, an AI-written narrative paragraph
 * ("Have 5 active candidates with 3 strong yes; 2 unscored and 5 stalled 14+
 * days,prioritize follow-ups to move decisions.") and four bordered stat tiles.
 * Three problems: the board is the point of this page and this pushed it below
 * the fold; the narrative restated numbers that were already on screen two
 * inches lower; and it cost an LLM call on every page load to do so.
 *
 * The board itself now shows counts per column, so this only carries what the
 * columns cannot: how many are stuck, and how many nobody has rated.
 */
export async function PipelineSummaryCard({ jobId }: { jobId: string }) {
  await getWorkspaceContext();
  const summary = await getPipelineSummary(jobId);
  const t = await getTranslations("features.pipeline.PipelineSummaryCard");

  if (!summary || summary.totalActive === 0) return null;

  const topFits =
    summary.byRecommendation.strong_yes + summary.byRecommendation.yes;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Stat label={t("active")} value={summary.totalActive} />
      {topFits > 0 ? <Stat label={t("ratedGoodFit")} value={topFits} /> : null}
      {summary.unscored > 0 ? (
        <Stat label={t("notRated")} value={summary.unscored} muted />
      ) : null}
      {summary.stalledCandidates > 0 ? (
        <Stat
          label={t("stuckDays", { days: summary.stalledDays })}
          value={summary.stalledCandidates}
          warning
        />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  warning,
  muted,
}: {
  label: string;
  value: number;
  warning?: boolean;
  muted?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 rounded-full bg-pure-snow py-1.5 pl-3 pr-3.5 shadow-[var(--shadow-card)]">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          warning ? "bg-warning-clay" : muted ? "bg-quiet-mist" : "bg-chartreuse-signal",
        )}
      />
      <span
        className={cn(
          "tabular-nums text-[14px] font-semibold",
          warning
            ? "text-warning-clay"
            : muted
              ? "text-soft-ink"
              : "text-near-ink",
        )}
      >
        {value}
      </span>
      <span className="text-[13px] text-soft-ink">{label}</span>
    </span>
  );
}
