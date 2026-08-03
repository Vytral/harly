"use client";

import { useRef } from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";

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
import { useDaysSince } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

type CandidateCardProps = {
  application: PipelineApplication;
  selected: boolean;
  disabled?: boolean;
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
const recommendationLabel: Record<
  NonNullable<PipelineApplication["aiRecommendation"]>,
  string
> = {
  strong_yes: "Strong fit",
  yes: "Good fit",
  maybe: "Possible fit",
  no: "Weak fit",
};

function AiFitNote({
  score,
  recommendation,
  source,
}: {
  score: number;
  recommendation: PipelineApplication["aiRecommendation"];
  source: PipelineApplication["evaluationSource"];
}) {
  const label = recommendation ? recommendationLabel[recommendation] : "Scored";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="font-chrome inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-soft-ink">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full",
              recommendation === "no"
                ? "bg-quiet-mist"
                : "bg-chartreuse-signal",
            )}
          />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {source === "rules" ? "Harly Algorithm" : "Harly AI"} rates this a {score}/100 fit. A suggestion, not a decision.
      </TooltipContent>
    </Tooltip>
  );
}

/** Only speaks up once someone has been waiting too long. */
function StageAge({ value }: { value: string }) {
  const days = useDaysSince(value);
  const stale = days >= STALE_AFTER_DAYS;

  return (
    <span
      className={cn(
        "font-chrome tabular shrink-0 whitespace-nowrap text-[11px]",
        stale ? "text-warning-clay" : "text-quiet-mist",
      )}
    >
      {stale ? `Stuck ${days}d` : `${days}d`}
    </span>
  );
}

export function CandidateCard({
  application,
  selected,
  disabled = false,
  onSelect,
}: CandidateCardProps) {
  const router = useRouter();
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

  return (
    <article
      ref={setNodeRef}
      role="link"
      tabIndex={0}
      aria-label={`Open ${fullName} profile`}
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
          router.push(`/dashboard/candidates/${application.candidateId}`);
        }
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(`/dashboard/candidates/${application.candidateId}`);
        }
      }}
      className={cn(
        // A person in a column, not a mini-card: flat snow, hairline, row-wash
        // hover. No shadow, no coloured left accent bar, no scale-on-press.
        "group cursor-pointer rounded-[var(--radius-md)] border bg-pure-snow px-2.5 py-2.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
        selected
          ? "border-near-ink/20 bg-row-wash"
          : "border-hairline hover:bg-row-wash",
        isDragging && "opacity-40",
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
            disabled={disabled}
            onCheckedChange={(checked) =>
              onSelect(application.id, checked === true)
            }
            aria-label={`Select ${fullName}`}
          />
        </span>
        <Link
          href={`/dashboard/candidates/${application.candidateId}`}
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
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          className="shrink-0 touch-none cursor-grab rounded-md p-1 text-quiet-mist opacity-0 transition hover:text-near-ink group-hover:opacity-100 active:cursor-grabbing"
          aria-label={`Drag ${fullName} to another stage`}
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
    <article className="w-56 cursor-grabbing rounded-[var(--radius-md)] border border-mist-border bg-pure-snow px-2.5 py-2.5 shadow-[var(--shadow-float)] lg:w-64">
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
