"use client";

import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  CircleDashedIcon,
  LockSimpleIcon,
  XCircleIcon,
} from "@/components/ui/icons/phosphor";

type Stage = {
  id: string;
  name: string;
  order: number;
};

type PortalInterviewPlanProps = {
  stages: Stage[];
  currentStageId: string | null;
  applicationStatus: "active" | "hired" | "rejected" | "withdrawn";
};

export function PortalInterviewPlan({
  stages,
  currentStageId,
  applicationStatus,
}: PortalInterviewPlanProps) {
  if (stages.length === 0) return null;

  const currentIdx = stages.findIndex((s) => s.id === currentStageId);
  const isHired = applicationStatus === "hired";
  const isRejected = applicationStatus === "rejected";

  // Rejected: only show stages up to where the candidate got to, then the
  // rejection. Hired / active: show the full plan.
  const visibleStages =
    isRejected && currentIdx >= 0 ? stages.slice(0, currentIdx + 1) : stages;

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Application progress
      </h2>
      <div className="space-y-2">
        {visibleStages.map((stage, idx) => {
          // In a terminal state every visible stage is a completed step.
          const isCurrent =
            applicationStatus === "active" && idx === currentIdx;
          const isFuture = applicationStatus === "active" && idx > currentIdx;
          const isDone = !isCurrent && !isFuture;

          return (
            <div
              key={stage.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                isCurrent &&
                  "border-violet-300 bg-violet-100 dark:border-violet-800 dark:bg-violet-950/30",
                isDone &&
                  "border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                isFuture && "border-dashed border-border bg-muted/40"
              )}
            >
              {isDone ? (
                <CheckCircleIcon className="size-5 shrink-0 text-emerald-600" />
              ) : isCurrent ? (
                <CircleDashedIcon className="size-5 shrink-0 text-violet-600 dark:text-violet-400" />
              ) : (
                <LockSimpleIcon className="size-5 shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "text-sm font-semibold",
                  isCurrent && "text-violet-800 dark:text-violet-300",
                  isDone && "text-foreground",
                  isFuture && "font-medium text-muted-foreground"
                )}
              >
                {stage.name}
              </span>
            </div>
          );
        })}

        {/* Terminal result: highlight hired (green) or rejected (red). */}
        {isHired && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
            <CheckCircleIcon className="size-5 shrink-0 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
              Hired
            </span>
          </div>
        )}
        {isRejected && (
          <div className="flex items-center gap-3 rounded-xl border border-red-300 bg-red-100 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
            <XCircleIcon className="size-5 shrink-0 text-rust" />
            <span className="text-sm font-bold text-rust">
              Not selected
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
