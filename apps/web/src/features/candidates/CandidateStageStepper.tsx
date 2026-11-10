import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { StageKind } from "@harly/db/stage-kind";

import { buildSpine, type StageSource } from "@/lib/stage-visuals";
import { cn } from "@/lib/utils";
import { stageLabel } from "@/features/pipeline/stage-label";

const STEPPER_STAGES: readonly (StageSource & { kind: StageKind })[] = [
  { name: "Applied", kind: "applied" },
  { name: "Screening", kind: "screening" },
  { name: "Interview", kind: "interview" },
  { name: "Offer", kind: "offer" },
];

/**
 * Compact Applied → Screening → Interview → Offer stepper for the decision
 * bar. Past steps carry an olive check, the current one is ink/semibold and
 * future ones go quiet. Renders nothing for terminal outcomes or stages that
 * are not on the canonical path (the spine elsewhere still covers those).
 */
export function CandidateStageStepper({
  stageName,
  className,
}: {
  stageName: string | null;
  className?: string;
}) {
  const t = useTranslations("features.candidates.stageStepper");
  const tStages = useTranslations("labels.pipeline.stages");
  if (!stageName) return null;
  const model = buildSpine({
    current: { name: stageName },
    stages: STEPPER_STAGES,
  });
  if (model.terminal !== null || model.position === 0) return null;

  return (
    <ol
      aria-label={t("progress", { label: stageLabel(model.label, tStages) })}
      className={cn("flex min-w-0 items-center gap-1.5 text-xs", className)}
    >
      {model.segments.map((segment, index) => (
        <li key={segment.key} className="flex items-center gap-1.5">
          {index > 0 ? (
            <span aria-hidden className="h-px w-3 bg-border" />
          ) : null}
          <span
            aria-current={segment.isCurrent ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap transition-colors duration-150",
              segment.state === "current" && "font-semibold text-near-ink",
              segment.state === "done" && "font-medium text-soft-ink",
              segment.state === "todo" && "text-quiet-mist",
            )}
          >
            {segment.state === "done" ? (
              <Check className="size-3 text-success-olive" strokeWidth={2.4} />
            ) : null}
            {stageLabel(segment.name, tStages)}
          </span>
        </li>
      ))}
    </ol>
  );
}
