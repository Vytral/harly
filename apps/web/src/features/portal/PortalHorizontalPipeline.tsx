"use client";

import { cn } from "@/lib/utils";
import { CheckCircleIcon, XCircleIcon } from "@/components/ui/icons/phosphor";

type Stage = { id: string; name: string; order: number };

type PortalHorizontalPipelineProps = {
  stages: Stage[];
  currentStageId: string | null;
  applicationStatus: string;
  className?: string;
};

export function PortalHorizontalPipeline({
  stages,
  currentStageId,
  applicationStatus,
  className,
}: PortalHorizontalPipelineProps) {
  if (stages.length === 0) return null;

  const isTerminal = applicationStatus === "rejected" || applicationStatus === "withdrawn";
  const currentIdx = stages.findIndex((s) => s.id === currentStageId);
  const lastIdx = stages.length - 1;

  // How far the filled track should reach, as a fraction of the full line
  // (dot-center to dot-center) — one segment per completed step.
  const progressFraction =
    lastIdx > 0 && currentIdx >= 0 ? currentIdx / lastIdx : 0;

  return (
    <div className={cn("w-full", className)}>
      {/* Dots + connecting track, sharing one relative row so the track never
          out-sizes its container (each dot claims equal flex space). */}
      <div className="relative flex items-center">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-hairline" />
        <div
          className={cn(
            "absolute inset-y-0 left-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-[width]",
            isTerminal && applicationStatus === "rejected" ? "bg-rust" : "bg-pine",
          )}
          style={{ width: `${progressFraction * 100}%` }}
        />

        {stages.map((stage, idx) => {
          const completed = !isTerminal && currentIdx >= 0 && idx < currentIdx;
          const isCurrent = !isTerminal && idx === currentIdx;
          const isFuture = !isTerminal && (currentIdx < 0 || idx > currentIdx);
          const isTerminalCurrent = isTerminal && idx === currentIdx;
          const isPastTerminal = isTerminal && currentIdx >= 0 && idx < currentIdx;

          return (
            <div
              key={stage.id}
              className={cn(
                "relative z-10 flex flex-1 items-center justify-center",
                idx === 0 && "justify-start",
                idx === lastIdx && "justify-end",
              )}
            >
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-card transition-colors",
                  (completed || isPastTerminal) && "bg-pine text-white",
                  isCurrent && "bg-lime text-lime-ink ring-2 ring-lime/30",
                  isFuture && "border-2 border-hairline bg-card",
                  isTerminalCurrent && applicationStatus === "rejected" && "bg-rust text-white",
                  isTerminalCurrent && applicationStatus === "withdrawn" && "bg-muted-foreground/50 text-white",
                )}
              >
                {(completed || isPastTerminal) && <CheckCircleIcon className="size-3.5" />}
                {isCurrent && <div className="size-2 rounded-full bg-lime-ink" />}
                {isFuture && <div className="size-1.5 rounded-full bg-quiet-mist" />}
                {isTerminalCurrent && applicationStatus === "rejected" && <XCircleIcon className="size-3.5" />}
                {isTerminalCurrent && applicationStatus === "withdrawn" && <div className="size-2 rounded-full bg-white" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Labels: same equal-share grid as the dots above, so each one sits
          centered under its dot without forcing the row to overflow. */}
      <div className="mt-2 flex">
        {stages.map((stage, idx) => {
          const completed = !isTerminal && currentIdx >= 0 && idx <= currentIdx;
          const isCurrent = !isTerminal && idx === currentIdx;
          const isPastTerminal = isTerminal && currentIdx >= 0 && idx <= currentIdx;
          const isTerminalCurrent = isTerminal && idx === currentIdx;

          return (
            <div
              key={stage.id}
              className={cn(
                "flex-1 px-1 text-center text-[11px] leading-tight",
                idx === 0 && "text-left",
                idx === lastIdx && "text-right",
              )}
            >
              <span
                className={cn(
                  (completed || isPastTerminal) && !isCurrent && !isTerminalCurrent && "font-medium text-foreground",
                  isCurrent && "font-semibold text-foreground",
                  !completed && !isPastTerminal && "text-muted-foreground",
                  isTerminalCurrent && applicationStatus === "rejected" && "font-semibold text-rust",
                  isTerminalCurrent && applicationStatus === "withdrawn" && "font-medium text-muted-foreground",
                )}
              >
                {stage.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}