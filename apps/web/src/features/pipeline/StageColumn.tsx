"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";
import { BellIcon, BellSlashIcon } from "@/components/ui/icons/phosphor";
import { CandidateCard } from "@/features/pipeline/CandidateCard";
import type {
  PipelineApplication,
  PipelineStage,
} from "@/features/pipeline/data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StageKind } from "@harly/db/stage-kind";

import { isTerminalStage, kindOf, stageDisplayName } from "@/lib/stage-visuals";
import { stageLabel } from "@/features/pipeline/stage-label";
import { cn } from "@/lib/utils";

type StageColumnProps = {
  stage: PipelineStage;
  /** The cards to render (already capped by the board). */
  applications: PipelineApplication[];
  /** The true number of candidates in this column after filters. */
  totalCount: number;
  /** Cards not rendered yet. */
  remainingCount: number;
  /** How many the "Show more" control reveals (one page, or what is left). */
  revealCount: number;
  selectedIds: Set<string>;
  pendingIds: Set<string>;
  /** Column position, so the header dot can show funnel progression. */
  index: number;
  total: number;
  onSelect: (applicationId: string, selected: boolean) => void;
  onToggleStageEmail: (stageId: string, enabled: boolean) => void;
  onShowMore: (stageId: string) => void;
};

/**
 * Funnel progression, ink lightening as the column narrows , the same ramp the
 * dashboard's pipeline overview uses, so a stage looks like the same stage in
 * both places. Stages carry no per-stage brand hue: a colour per column was five
 * competing accents across a screen that is meant to be one calm surface.
 */
function stageDotColor(index: number, total: number) {
  if (total <= 1) return "var(--near-ink)";
  const ramp = [
    "var(--near-ink)",
    "color-mix(in srgb, var(--near-ink) 80%, var(--pure-snow))",
    "var(--soft-ink)",
    "var(--quiet-mist)",
    "var(--chartreuse-signal)",
  ];
  const position = Math.round((index / (total - 1)) * (ramp.length - 1));
  return ramp[Math.min(position, ramp.length - 1)];
}

/**
 * Terminal columns (hired, rejected, withdrawn) are the archive of the funnel,
 * not the work in it, so they recede: no funnel colour, muted header. Hired is
 * the one terminal stage that keeps a success tone, and only as the dot.
 */
function terminalDotClass(kind: StageKind) {
  return kind === "hired" ? "bg-success-olive" : "bg-quiet-mist";
}

export function StageColumn({
  stage,
  applications,
  totalCount,
  remainingCount,
  revealCount,
  selectedIds,
  pendingIds,
  index,
  total,
  onSelect,
  onToggleStageEmail,
  onShowMore,
}: StageColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: stage.id,
    data: { type: "stage", stageId: stage.id },
  });
  const emailOn = stage.emailConfig.candidateUpdatesEnabled;
  const kind = kindOf(stage);
  const terminal = isTerminalStage(stage);
  const t = useTranslations("features.pipeline.StageColumn");
  const tStages = useTranslations("labels.pipeline.stages");
  const displayName = stageLabel(stageDisplayName(stage), tStages);

  return (
    <section
      ref={setNodeRef}
      aria-label={t("columnLabel", { name: displayName, count: totalCount })}
      className={cn(
        // The column is a region of paper, not a bordered grey box. Depth is
        // luminance: paper column on the snow stage, and the drop target lights
        // up with the sage wash rather than a coloured border.
        "flex min-w-0 flex-col rounded-[var(--radius-card)] transition-colors duration-150",
        terminal ? "bg-card-inset/60" : "bg-card-inset",
        isOver && "bg-lime-wash",
      )}
    >
      <div
        className={cn(
          "sticky top-0 z-10 rounded-t-[var(--radius-card)] px-3.5 pb-2.5 pt-3.5",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                terminal && terminalDotClass(kind),
              )}
              style={terminal ? undefined : { backgroundColor: stageDotColor(index, total) }}
              aria-hidden
            />
            <h2
              className={cn(
                "truncate text-[13.5px] font-semibold",
                terminal ? "text-soft-ink" : "text-near-ink",
              )}
            >
              {displayName}
            </h2>
            <span className="font-chrome tabular-nums rounded-full bg-pure-snow px-2 py-0.5 text-[11.5px] leading-none text-soft-ink">
              {totalCount}
            </span>
          </div>

          {/*
            The bell used to sit in every column header as a coloured toggle ,
            five always-on switches for a setting you change once. It moved into
            a per-column overflow, which is where rare configuration belongs.
          */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t("stageSettings", { name: displayName })}
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-quiet-mist opacity-0 transition-opacity hover:text-near-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/board:opacity-100 data-[state=open]:opacity-100"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem
                className="gap-2.5"
                onClick={() => onToggleStageEmail(stage.id, !emailOn)}
              >
                {emailOn ? (
                  <BellSlashIcon className="size-4 text-soft-ink" />
                ) : (
                  <BellIcon className="size-4 text-soft-ink" />
                )}
                {emailOn
                  ? t("stopEmailing")
                  : t("emailWhenReached")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <SortableContext
        items={applications.map((application) => application.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex max-h-[calc(100vh-15rem)] flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5">
          {applications.map((application) => (
            <CandidateCard
              key={application.id}
              application={application}
              selected={selectedIds.has(application.id)}
              pending={pendingIds.has(application.id)}
              onSelect={onSelect}
            />
          ))}
          {remainingCount > 0 ? (
            <button
              type="button"
              onClick={() => onShowMore(stage.id)}
              aria-label={t("showMoreHidden", { count: revealCount, remaining: remainingCount, name: displayName })}
              className="font-chrome rounded-[var(--radius-md)] px-2 py-2 text-center text-[12px] text-soft-ink transition-colors hover:bg-row-wash hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
            >
              {t("showMore", { count: revealCount })}
            </button>
          ) : null}
          {totalCount === 0 ? (
            /*
             * An empty column is the normal state of a healthy funnel, so it
             * says almost nothing. The old dashed "Drop candidates here" box in
             * every empty column shouted five times about an absence.
             */
            <div
              className={cn(
                "flex min-h-16 items-center justify-center rounded-[var(--radius-md)] text-center transition-colors",
                isOver ? "text-success-olive" : "text-quiet-mist",
              )}
            >
              <span className="font-chrome text-[11px]">
                {isOver ? t("dropToMove") : t("empty")}
              </span>
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}
