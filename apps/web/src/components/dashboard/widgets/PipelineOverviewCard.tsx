import { GitBranch } from "lucide-react";

import type { PipelineOverview } from "@/features/dashboard/widgets";
import { Tile, TileHeader, TileLink, EmptyHint } from "./primitives";
import { PipelineJobSelect } from "./PipelineJobSelect";

/**
 * Funnel lanes, Applied → Hired.
 *
 * Was five unrelated hues (pine, jade, burnt orange, violet, stone) , a rainbow
 * that read as a second and third brand family and made the funnel look like a
 * pie chart. DESIGN.md allows exactly one accent, so depth here comes from
 * *progression*: ink lightens as the funnel narrows, and the final stage is the
 * chartreuse signal, because reaching Hired is the one genuinely live event in
 * the sequence.
 */
const LANE_COLORS = [
  "#171717", // Applied , near ink
  "#3d3d3a",
  "#6a6a67", // soft ink
  "#9a9a96", // quiet mist
  "#c8f560", // Hired , chartreuse signal
];

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
      <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-3">
        {data.selected ? (
          <>
            <p className="truncate text-sm font-medium">{data.selected.title}</p>

            {/* Segmented funnel bar */}
            <div className="flex h-2.5 w-full gap-1 overflow-hidden">
              {data.total > 0 ? (
                data.stages.map((stage, i) =>
                  stage.count > 0 ? (
                    <div
                      key={stage.name}
                      className="h-full rounded-full"
                      style={{
                        width: `${(stage.count / data.total) * 100}%`,
                        backgroundColor: LANE_COLORS[i % LANE_COLORS.length],
                      }}
                    />
                  ) : null,
                )
              ) : (
                <div className="h-full w-full rounded-full bg-muted" />
              )}
            </div>

            {/* Stage counts */}
            <div className="grid grid-cols-5 gap-2">
              {data.stages.map((stage, i) => (
                <div key={stage.name} className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: LANE_COLORS[i % LANE_COLORS.length] }}
                    />
                    <span className="truncate text-xs text-muted-foreground">
                      {stage.name}
                    </span>
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
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
