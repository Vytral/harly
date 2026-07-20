"use client";

import React from "react";
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

  return (
    <div className={cn("flex items-start w-full overflow-x-auto", className)}>
      {stages.map((stage, idx) => {
        const completed = !isTerminal && currentIdx >= 0 && idx < currentIdx;
        const isCurrent = !isTerminal && idx === currentIdx;
        const isFuture = !isTerminal && currentIdx >= 0 && idx > currentIdx;
        const isTerminalCurrent = isTerminal && idx === currentIdx;

        return (
          <React.Fragment key={stage.id}>
            {/* Stage column: dot on top, label below */}
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full transition-colors",
                  completed && "bg-pine text-white",
                  isCurrent && "bg-pine text-white ring-2 ring-lime ring-offset-2 ring-offset-card",
                  isFuture && "border-2 border-muted-foreground/30 bg-card",
                  isTerminalCurrent && applicationStatus === "rejected" && "bg-rust text-white ring-2 ring-rust/30 ring-offset-2 ring-offset-card",
                  isTerminalCurrent && applicationStatus === "withdrawn" && "bg-muted-foreground/50 text-white ring-2 ring-muted-foreground/30 ring-offset-2 ring-offset-card",
                )}
              >
                {completed && <CheckCircleIcon className="size-3" />}
                {isCurrent && <div className="size-1.5 rounded-full bg-white" />}
                {isFuture && <div className="size-1 rounded-full bg-muted-foreground/40" />}
                {isTerminalCurrent && applicationStatus === "rejected" && <XCircleIcon className="size-3" />}
                {isTerminalCurrent && applicationStatus === "withdrawn" && <div className="size-1.5 rounded-full bg-white" />}
              </div>
              <span
                className={cn(
                  "mt-1.5 text-[11px] leading-tight truncate max-w-[80px] text-center hidden sm:block",
                  completed && "font-medium text-foreground",
                  isCurrent && "font-semibold text-foreground",
                  isFuture && "text-muted-foreground",
                  isTerminalCurrent && applicationStatus === "rejected" && "font-semibold text-rust",
                  isTerminalCurrent && applicationStatus === "withdrawn" && "font-medium text-muted-foreground",
                )}
              >
                {stage.name}
              </span>
            </div>

            {/* Connector line between stages */}
            {idx < stages.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-full mt-2.5",
                  completed && "bg-pine",
                  isCurrent && "bg-gradient-to-r from-pine to-muted-foreground/30",
                  isFuture && "bg-muted-foreground/20",
                  isTerminalCurrent && "bg-muted-foreground/20",
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}