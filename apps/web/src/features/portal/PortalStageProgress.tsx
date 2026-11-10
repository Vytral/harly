import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { PortalApplicationStatus, PortalStage } from "./application-progress";

/**
 * Segmented progress through a job's stages (one segment per stage). Finished
 * segments are ink, the current one is lime, a rejection marks the stage it
 * ended on. Server-safe: the fill animation is pure CSS and switches off under
 * reduced motion.
 */
export function PortalStageProgress({
  stages,
  currentStageId,
  status,
  variant = "full",
  className,
}: {
  stages: PortalStage[];
  currentStageId: string | null;
  status: PortalApplicationStatus;
  variant?: "full" | "compact";
  className?: string;
}) {
  const t = useTranslations("portal.progress");
  if (stages.length === 0) return null;

  const hired = status === "hired";
  const currentIdx = hired ? stages.length - 1 : stages.findIndex((s) => s.id === currentStageId);
  const compact = variant === "compact";

  function segmentFill(idx: number): string | null {
    if (hired) return "bg-success-olive";
    if (currentIdx < 0 || idx > currentIdx) return null;
    if (idx < currentIdx) return "bg-foreground";
    if (status === "rejected") return "bg-danger-rust";
    if (status === "withdrawn") return "bg-soft-ink";
    return "bg-lime";
  }

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn("flex", compact ? "gap-1" : "gap-1.5")}
        role="img"
        aria-label={
          currentIdx >= 0
            ? t("current", { step: currentIdx + 1, total: stages.length, name: stages[currentIdx]!.name })
            : t("steps", { count: stages.length })
        }
      >
        {stages.map((stage, idx) => {
          const fill = segmentFill(idx);
          return (
            <span
              key={stage.id}
              className={cn(
                "relative flex-1 overflow-hidden rounded-full bg-card-inset",
                compact ? "h-1.5" : "h-2",
              )}
            >
              {fill ? (
                <span
                  className={cn("animate-segment-fill absolute inset-0 rounded-full", fill)}
                  style={{ animationDelay: `${idx * 70}ms` }}
                />
              ) : null}
            </span>
          );
        })}
      </div>

      {!compact ? (
        <ol className="mt-3 hidden gap-1.5 sm:flex" aria-hidden="true">
          {stages.map((stage, idx) => (
            <li
              key={stage.id}
              className={cn(
                "min-w-0 flex-1 truncate text-[12px] leading-tight",
                idx === currentIdx ? "font-semibold text-foreground" : idx < currentIdx ? "text-foreground/80" : "text-soft-ink",
              )}
              title={stage.name}
            >
              {stage.name}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
