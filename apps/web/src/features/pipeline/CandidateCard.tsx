"use client";

import { useRef } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { DotsSixVerticalIcon } from "@/components/ui/icons/phosphor";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PipelineApplication } from "@/features/pipeline/data";
import { candidateHref, pipelineOrigin } from "@/features/candidates/origin";
import { useDaysSince } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";
import { scoreBand, type ScoreBand } from "@/lib/evaluation/score-band";

type CandidateCardProps = {
  application: PipelineApplication;
  selected: boolean;
  /** A write for this candidate is waiting or in flight. Only this card is busy. */
  pending?: boolean;
  onSelect: (applicationId: string, selected: boolean) => void;
};

type CandidateCardOverlayProps = {
  application: PipelineApplication;
};

/** Days a candidate can sit in a stage before the card admits it is stuck. */
const STALE_AFTER_DAYS = 14;

/**
 * AI fit, stated the way a colleague would state it.
 *
 * Was a coloured pill with a target icon and a bare number , four possible
 * colours, so the loudest thing on a card was a machine's opinion. It now reads
 * as one quiet line of text, and the *number* is only in the tooltip alongside
 * the reasoning. A score is a suggestion; it should not out-shout the person's
 * name (DESIGN.md , "AI is optional guidance inside flows").
 */
const recommendationLabelKey: Record<
  NonNullable<PipelineApplication["aiRecommendation"]>,
  "fitStrong" | "fitGood" | "fitPossible" | "fitWeak"
> = {
  strong_yes: "fitStrong",
  yes: "fitGood",
  maybe: "fitPossible",
  no: "fitWeak",
};

/** Dot colour per shared score band (lib/evaluation/score-band.ts). */
function dotTone(band: ScoreBand) {
  if (band === "strong" || band === "good") return "bg-chartreuse-signal";
  if (band === "mixed") return "bg-warning-clay";
  return "bg-quiet-mist";
}

function AiFitNote({
  score,
  recommendation,
  source,
}: {
  score: number;
  recommendation: PipelineApplication["aiRecommendation"];
  source: PipelineApplication["evaluationSource"];
}) {
  const t = useTranslations("features.pipeline.CandidateCard");
  const label = recommendation ? t(recommendationLabelKey[recommendation]) : t("scored");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="font-chrome inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-soft-ink">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full",
              dotTone(scoreBand(score)),
            )}
          />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {t("fitTooltip", { engine: source === "rules" ? "Harly Algorithm" : "Harly AI", score })}
      </TooltipContent>
    </Tooltip>
  );
}

/** Only speaks up once someone has been waiting too long. */
function StageAge({ value }: { value: string }) {
  const t = useTranslations("features.pipeline.CandidateCard");
  const days = useDaysSince(value);
  const stale = days >= STALE_AFTER_DAYS;

  return (
    <span
      className={cn(
        "font-chrome tabular shrink-0 whitespace-nowrap text-[11px]",
        stale ? "text-warning-clay" : "text-quiet-mist",
      )}
    >
      {stale ? t("stuckDays", { days }) : t("days", { days })}
    </span>
  );
}

export function CandidateCard({
  application,
  selected,
  pending = false,
  onSelect,
}: CandidateCardProps) {
  const router = useRouter();
  const t = useTranslations("features.pipeline.CandidateCard");
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
    data: { type: "application", stageId: application.currentStageId },
  });
  const fullName = `${application.candidateFirstName} ${application.candidateLastName}`;
  const stageStartedAt = application.lastStageMovedAt ?? application.createdAt;
  // Opened from the board: the candidate's pager walks the board column by column.
  const href = candidateHref(
    application.candidateId,
    pipelineOrigin({ jobId: application.jobId, view: "board" }),
    application.id,
  ) as Route;

  return (
    <article
      ref={setNodeRef}
      role="link"
      tabIndex={0}
      aria-label={t("openProfile", { name: fullName })}
      aria-busy={pending || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onPointerDownCapture={(event) => {
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        const pointerStart = pointerStartRef.current;
        const movedDistance = pointerStart
          ? Math.hypot(
              event.clientX - pointerStart.x,
              event.clientY - pointerStart.y,
            )
          : 0;
        if (!isDragging && movedDistance <= 6) {
          router.push(href);
        }
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(href);
        }
      }}
      className={cn(
        // White card on the inset lane: card shadow, 1px lift on hover.
        "group cursor-pointer rounded-[var(--radius-inner)] bg-pure-snow px-3 py-3 shadow-[var(--shadow-card)] transition-[transform,box-shadow,background-color,opacity] duration-150",
        "hover:-translate-y-px hover:shadow-[var(--shadow-soft),var(--shadow-card)] motion-reduce:hover:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
        selected
          ? "bg-lime-wash shadow-[inset_0_0_0_1.5px_var(--near-ink)]"
          : null,
        isDragging && "opacity-40",
        pending && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "shrink-0 transition-opacity",
            selected
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) =>
              onSelect(application.id, checked === true)
            }
            aria-label={t("selectCandidate", { name: fullName })}
          />
        </span>
        <Link
          href={href}
          onClick={(event) => event.stopPropagation()}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <UserAvatar
            name={fullName}
            src={application.candidateAvatarUrl}
            fallbackSrcs={application.candidateAvatarFallbackSrcs}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium leading-tight text-near-ink">
              {fullName}
            </p>
            <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden">
              {application.aiScore != null ? (
                <AiFitNote
                  score={application.aiScore}
                  recommendation={application.aiRecommendation}
                  source={application.evaluationSource}
                />
              ) : null}
              <StageAge value={stageStartedAt} />
              {application.isFeaturedReferral ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      aria-label={t("featuredReferral")}
                      className="inline-flex shrink-0 items-center text-warning-clay"
                    >
                      <Star className="size-3 fill-current" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t("featuredReferral")}</TooltipContent>
                </Tooltip>
              ) : null}
              {application.status !== "active" ? (
                <ApplicationStatusBadge status={application.status} />
              ) : null}
            </div>
          </div>
        </Link>
        {/*
          Drag is the move affordance. The Hire and Reject buttons that used to
          appear here on hover are gone: ending someone's candidacy from a
          hover-revealed 11px link on a kanban card, with no context and no
          confirmation, is the most consequential action in the product behind
          the least deliberate gesture. Those decisions live on the candidate
          surface, where the resume and the rest of the team's notes are.
        */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          data-pipeline-handle={application.id}
          onClick={(event) => event.stopPropagation()}
          className="shrink-0 touch-none cursor-grab rounded-md p-1 text-quiet-mist opacity-0 transition hover:text-near-ink group-hover:opacity-100 active:cursor-grabbing"
          aria-label={t("dragCandidate", { name: fullName })}
        >
          <DotsSixVerticalIcon className="size-3.5" />
        </button>
      </div>
    </article>
  );
}

export function CandidateCardOverlay({ application }: CandidateCardOverlayProps) {
  const fullName = `${application.candidateFirstName} ${application.candidateLastName}`;

  return (
    <article className="drag-pickup w-56 cursor-grabbing rounded-[var(--radius-inner)] bg-pure-snow px-3 py-3 shadow-[var(--shadow-float)] lg:w-64">
      <div className="flex items-center gap-2.5">
        <UserAvatar
          name={fullName}
          src={application.candidateAvatarUrl}
          fallbackSrcs={application.candidateAvatarFallbackSrcs}
          size="sm"
        />
        <p className="truncate text-[14px] font-medium leading-tight text-near-ink">
          {fullName}
        </p>
      </div>
    </article>
  );
}
