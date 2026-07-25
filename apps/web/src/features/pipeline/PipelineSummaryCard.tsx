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

  if (!summary || summary.totalActive === 0) return null;

  const topFits =
    summary.byRecommendation.strong_yes + summary.byRecommendation.yes;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1">
      <Stat label="active" value={summary.totalActive} />
      {topFits > 0 ? <Stat label="rated a good fit" value={topFits} /> : null}
      {summary.unscored > 0 ? (
        <Stat label="not rated" value={summary.unscored} muted />
      ) : null}
      {summary.stalledCandidates > 0 ? (
        <Stat
          label={`stuck ${summary.stalledDays}+ days`}
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
    <span className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "tabular text-[15px] font-medium",
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
