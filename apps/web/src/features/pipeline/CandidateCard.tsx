"use client";

import { useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";

import {
  CheckIcon,
  ClockIcon,
  DotsSixVerticalIcon,
  TargetIcon,
  XIcon,
} from "@/components/ui/icons/phosphor";
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
  onStatusChange: (
    applicationIds: string[],
    status: PipelineApplication["status"],
  ) => void;
};

type CandidateCardOverlayProps = {
  application: PipelineApplication;
};

const accentStyles: Record<PipelineApplication["status"], string> = {
  active: "border-l-transparent",
  hired: "border-l-success",
  rejected: "border-l-destructive",
  withdrawn: "border-l-muted-foreground/30",
};

/** Days a candidate can sit in a stage before the meta pill flags it as stale. */
const STALE_AFTER_DAYS = 14;

const recommendationTone: Record<
  NonNullable<PipelineApplication["aiRecommendation"]>,
  { pill: string; label: string }
> = {
  strong_yes: { pill: "bg-success/10 text-success", label: "Strong yes" },
  yes: { pill: "bg-success/10 text-success", label: "Yes" },
  maybe: { pill: "bg-warning/10 text-warning", label: "Maybe" },
  no: { pill: "bg-destructive/10 text-destructive", label: "No" },
};

function ScorePill({
  score,
  recommendation,
}: {
  score: number;
  recommendation: PipelineApplication["aiRecommendation"];
}) {
  const tone = recommendation
    ? recommendationTone[recommendation]
    : { pill: "bg-muted text-muted-foreground", label: "Scored" };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
            tone.pill,
          )}
        >
          <TargetIcon className="size-2.5" />
          {score}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        AI fit {score}/100, {tone.label}
      </TooltipContent>
    </Tooltip>
  );
}

function StageAgePill({ value }: { value: string }) {
  const days = useDaysSince(value);
  const stale = days >= STALE_AFTER_DAYS;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        stale ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground",
      )}
    >
      <ClockIcon className="size-2.5" />
      {days}d
    </span>
  );
}

export function CandidateCard({
  application,
  selected,
  disabled = false,
  onSelect,
  onStatusChange,
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
        "group cursor-pointer rounded-xl border border-border/70 border-l-[3px] bg-card p-3 shadow-sm transition-[transform,box-shadow,background-color] duration-150 ease-out active:scale-[0.98]",
        accentStyles[application.status],
        selected
          ? "ring-2 ring-primary/30 bg-accent/20"
          : "hover:shadow-md",
        isDragging && "z-10 scale-[0.97] opacity-50 shadow-lg",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "shrink-0 transition-opacity",
            selected
              ? "opacity-100"
              : "opacity-30 group-hover:opacity-100 group-focus-within:opacity-100",
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
        <UserAvatar
          name={fullName}
          src={application.candidateAvatarUrl}
          fallbackSrcs={application.candidateAvatarFallbackSrcs}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{fullName}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {application.candidateEmail}
          </p>
        </div>
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          className="shrink-0 touch-none cursor-grab rounded-md p-0.5 text-muted-foreground/50 opacity-40 transition hover:bg-accent hover:text-foreground hover:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
          aria-label={`Drag ${fullName}`}
        >
          <DotsSixVerticalIcon className="size-3.5" />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {application.aiScore != null ? (
          <ScorePill score={application.aiScore} recommendation={application.aiRecommendation} />
        ) : null}
        <StageAgePill value={stageStartedAt} />
        {application.source ? (
          <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {application.source}
          </span>
        ) : null}
        {application.status !== "active" ? (
          <ApplicationStatusBadge status={application.status} />
        ) : null}
      </div>

      <div className="mt-2.5 flex justify-end gap-1 border-t pt-2 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onStatusChange([application.id], "hired");
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-success transition hover:bg-success/10 active:scale-[0.97]"
        >
          <CheckIcon className="size-3" />
          Hire
        </button>
          <button
            type="button"
            disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onStatusChange([application.id], "rejected");
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-destructive transition hover:bg-destructive/10 active:scale-[0.97]"
        >
          <XIcon className="size-3" />
          Reject
        </button>
      </div>
    </article>
  );
}

export function CandidateCardOverlay({ application }: CandidateCardOverlayProps) {
  const fullName = `${application.candidateFirstName} ${application.candidateLastName}`;
  const stageStartedAt = application.lastStageMovedAt ?? application.createdAt;

  return (
    <article
      className={cn(
        "w-56 cursor-grabbing rounded-xl border border-border/70 border-l-[3px] bg-card p-3 shadow-2xl lg:w-64",
        accentStyles[application.status],
      )}
    >
      <div className="flex items-center gap-2">
        <UserAvatar
          name={fullName}
          src={application.candidateAvatarUrl}
          fallbackSrcs={application.candidateAvatarFallbackSrcs}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{fullName}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {application.candidateEmail}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {application.aiScore != null ? (
          <ScorePill score={application.aiScore} recommendation={application.aiRecommendation} />
        ) : null}
        <StageAgePill value={stageStartedAt} />
        {application.status !== "active" ? (
          <ApplicationStatusBadge status={application.status} />
        ) : null}
      </div>
    </article>
  );
}
