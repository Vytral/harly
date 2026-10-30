import type { StageKind } from "@harly/db/stage-kind";

import { buildSpine, stageDisplayName } from "@/lib/stage-visuals";
import { cn } from "@/lib/utils";

/**
 * The pipeline spine, Harly's signature stage indicator.
 * A segmented bar of the hiring pipeline with the current stage filled in pine.
 * Shown anywhere a candidate appears (overview, rows, cards, profile headers)
 * so the ATS's core metaphor is always legible at a glance.
 *
 * Meaning comes from stage kinds: the hired and rejected/withdrawn treatments
 * apply to whatever stage carries that kind, whatever it is called. Names are
 * only used to find a position when no stage id is supplied.
 */

const CANONICAL_STAGES: readonly PipelineSpineStage[] = [
  { name: "Applied", kind: "applied" },
  { name: "Screening", kind: "screening" },
  { name: "Interview", kind: "interview" },
  { name: "Offer", kind: "offer" },
  { name: "Hired", kind: "hired" },
];

export type PipelineSpineStage = {
  id?: string;
  name: string;
  kind: StageKind;
};

type PipelineSpineProps = {
  /** Current stage display name. */
  current: string;
  /** Current stage id, preferred over the name for finding its position. */
  currentId?: string | null;
  /**
   * Current stage kind. Callers that have it should pass it; without it the
   * kind is inferred from the name, which is only correct for the default
   * stage names.
   */
  currentKind?: StageKind | null;
  /** Ordered stages; defaults to the canonical five-stage pipeline. */
  stages?: readonly PipelineSpineStage[];
  /** Show the current stage label beside the spine. */
  showLabel?: boolean;
  className?: string;
};

const segmentClasses = {
  done: "bg-primary",
  current: "bg-primary ring-1 ring-primary/30",
  todo: "bg-soft-kraft",
  hired: "bg-success-olive",
  rejected: "bg-destructive",
  withdrawn: "bg-quiet-mist",
} as const;

export function PipelineSpine({
  current,
  currentId = null,
  currentKind = null,
  stages = CANONICAL_STAGES,
  showLabel = false,
  className,
}: PipelineSpineProps) {
  const model = buildSpine({
    current: { name: current, kind: currentKind },
    currentId,
    stages,
  });
  const isTerminal = model.terminal !== null;
  const labelTone =
    model.terminal === "rejected"
      ? "text-destructive"
      : model.terminal === "withdrawn"
        ? "text-soft-ink"
        : "text-muted-foreground";

  const ariaLabel = isTerminal
    ? model.label
    : model.position > 0
      ? `Stage: ${model.label} (${model.position} of ${model.total})`
      : `Stage: ${stageDisplayName({ name: current, kind: currentKind })}`;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex flex-1 items-center gap-1" role="img" aria-label={ariaLabel}>
        {model.segments.map((segment) => (
          <span
            key={segment.key}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              segmentClasses[segment.state],
            )}
          />
        ))}
      </div>
      {showLabel ? (
        <span className={cn("shrink-0 text-xs font-medium tabular-nums", labelTone)}>
          {model.label}
        </span>
      ) : null}
    </div>
  );
}
