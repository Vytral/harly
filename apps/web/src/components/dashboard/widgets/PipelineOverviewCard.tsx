import { GitBranch } from "lucide-react";

import type { PipelineOverview } from "@/features/dashboard/widgets";
import { Tile, TileHeader, TileLink, EmptyHint } from "./primitives";
import { PipelineJobSelect } from "./PipelineJobSelect";

/**
 * Funnel lanes, Applied → Hired.
 *
 * Deliberate exception to DESIGN.md's single-accent rule, scoped to this widget
 * only: five stages read as one blur in mono progression, and this card exists
 * specifically to be scanned at a glance. Distinct hues per stage, chosen close
 * in value so no single stage reads as a second brand accent; Hired keeps the
 * chartreuse signal since it's the one genuinely live event in the sequence.
 */
const LANE_COLORS = [
  "#8a8f98", // Applied , stone
  "#5b8def", // Screening , pine-blue
  "#e8a33d", // Interview , burnt orange
  "#a875e0", // Offer , violet
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
