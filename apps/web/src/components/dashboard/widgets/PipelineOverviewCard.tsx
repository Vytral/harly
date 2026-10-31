import { GitBranch } from "lucide-react";

import type { PipelineOverview } from "@/features/dashboard/widgets";
import { Tile, TileHeader, TileLink, EmptyHint } from "./primitives";
import { PipelineJobSelect } from "./PipelineJobSelect";

/**
 * Funnel lanes, Applied to Hired. Token-based (dark-mode safe): quiet neutrals
 * build toward ink, and Hired is the one live event so it takes the signal.
 */
const LANE_COLORS = [
  "bg-quiet-mist",
  "bg-status-quiet-ink",
  "bg-soft-ink",
  "bg-near-ink",
  "bg-chartreuse-signal",
];

const laneColor = (i: number) => LANE_COLORS[i % LANE_COLORS.length];

export function PipelineOverviewCard({
  data,
  className,
}: {
  data: PipelineOverview;
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeader
        icon={GitBranch}
        title="Pipeline overview"
        action={<TileLink href="/dashboard/pipeline">View pipeline</TileLink>}
      />
      <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-4">
        {data.selected ? (
          <>
            <p className="truncate text-[14px] font-medium text-near-ink">{data.selected.title}</p>

            {/* Segmented funnel bar */}
            <div className="flex h-2 w-full gap-1 overflow-hidden">
              {data.total > 0 ? (
                data.stages.map((stage, i) =>
                  stage.count > 0 ? (
                    <div
                      key={stage.name}
                      className={`h-full rounded-full ${laneColor(i)}`}
                      style={{ width: `${(stage.count / data.total) * 100}%` }}
                    />
                  ) : null,
                )
              ) : (
                <div className="h-full w-full rounded-full bg-card-inset" />
              )}
            </div>

            {/* Stage counts */}
            <div className="grid grid-cols-5 gap-2">
              {data.stages.map((stage, i) => (
                <div key={stage.name} className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`size-1.5 shrink-0 rounded-full ${laneColor(i)}`} />
                    <span className="truncate text-xs text-soft-ink">
                      {stage.name}
                    </span>
                  </div>
                  <p className="font-display mt-1 text-[24px] leading-none tabular-nums text-near-ink">
                    {stage.count}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-1">
              <PipelineJobSelect jobs={data.jobs} selectedId={data.selected.id} />
            </div>
          </>
        ) : (
          <EmptyHint
            icon={GitBranch}
            text="No open jobs yet. Publish a role to start a pipeline."
          />
        )}
      </div>
    </Tile>
  );
}
