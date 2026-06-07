import { cn } from "@/lib/utils";

/**
 * The pipeline spine — OpenHire's signature stage indicator.
 * A segmented bar of the hiring pipeline with the current stage filled in pine.
 * Shown anywhere a candidate appears (overview, rows, cards, profile headers)
 * so the ATS's core metaphor is always legible at a glance.
 */

const CANONICAL_STAGES = [
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Hired",
] as const;

const REJECTED = new Set(["rejected", "declined", "withdrawn"]);

type PipelineSpineProps = {
  /** Current stage name (matched case-insensitively against `stages`). */
  current: string;
  /** Ordered stage names; defaults to the canonical pipeline. */
  stages?: readonly string[];
  /** Show the current stage label beside the spine. */
  showLabel?: boolean;
  className?: string;
};

export function PipelineSpine({
  current,
  stages = CANONICAL_STAGES,
  showLabel = false,
  className,
}: PipelineSpineProps) {
  const normalized = current.trim().toLowerCase();
  const isRejected = REJECTED.has(normalized);
  const activeIndex = stages.findIndex((s) => s.toLowerCase() === normalized);
  const total = stages.length;
  const position = activeIndex >= 0 ? activeIndex + 1 : 0;

  const label = isRejected
    ? "Rejected"
    : activeIndex >= 0
      ? stages[activeIndex]
      : current;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="flex flex-1 items-center gap-1"
        role="img"
        aria-label={
          isRejected
            ? "Rejected"
            : position > 0
              ? `Stage: ${label} (${position} of ${total})`
              : `Stage: ${label}`
        }
      >
        {stages.map((stage, i) => {
          const filled = !isRejected && activeIndex >= 0 && i <= activeIndex;
          const isCurrent = !isRejected && i === activeIndex;
          return (
            <span
              key={stage}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                isRejected
                  ? "bg-destructive/30"
                  : filled
                    ? "bg-primary"
                    : "bg-muted",
                isCurrent && "ring-1 ring-primary/30",
              )}
            />
          );
        })}
      </div>
      {showLabel ? (
        <span
          className={cn(
            "shrink-0 text-xs font-medium tabular-nums",
            isRejected ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
