"use client";

import { useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, GripVertical } from "lucide-react";

import { UserAvatar } from "@/components/ui/UserAvatar";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import type { PipelineApplication } from "@/features/pipeline/data";
import { daysSince, formatShort } from "@/lib/date";
import { cn } from "@/lib/utils";

type CandidateCardProps = {
  application: PipelineApplication;
  selected: boolean;
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
  hired: "border-l-emerald-400",
  rejected: "border-l-rose-400",
  withdrawn: "border-l-zinc-300",
};

function CandidateCardContent({ application }: CandidateCardOverlayProps) {
  const fullName = `${application.candidateFirstName} ${application.candidateLastName}`;
  const stageStartedAt = application.lastStageMovedAt ?? application.createdAt;
  const daysInStage = daysSince(stageStartedAt);

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{fullName}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {application.jobTitle}
          </p>
        </div>
        <ApplicationStatusBadge status={application.status} />
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="size-3.5" />
          {formatShort(application.appliedAt)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" />
          {daysInStage}d in stage
        </span>
      </div>
    </div>
  );
}

export function CandidateCard({
  application,
  selected,
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

  return (
    <article
      ref={setNodeRef}
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
      className={cn(
        "group cursor-pointer rounded-lg border border-l-2 bg-card p-3 shadow-xs transition",
        accentStyles[application.status],
        selected
          ? "ring-2 ring-primary/40"
          : "hover:border-ring/40 hover:shadow-sm",
        isDragging && "z-10 opacity-60 shadow-lg",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          onClick={(event) => event.stopPropagation()}
          className="mt-0.5 opacity-0 transition group-hover:opacity-100"
        >
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) =>
              onSelect(application.id, checked === true)
            }
            aria-label={`Select ${fullName}`}
          />
        </span>
        <UserAvatar name={fullName} size="sm" />
        <CandidateCardContent application={application} />
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(event) => event.stopPropagation()}
          className="touch-none cursor-grab rounded-md p-1 text-muted-foreground/50 opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
          aria-label={`Drag ${fullName}`}
        >
          <GripVertical className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs">
        <span className="truncate text-muted-foreground">
          {application.source ?? "manual"}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStatusChange([application.id], "hired");
            }}
            className="rounded-md px-2 py-1 font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            Hire
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStatusChange([application.id], "rejected");
            }}
            className="rounded-md px-2 py-1 font-semibold text-rose-600 transition hover:bg-rose-50"
          >
            Reject
          </button>
        </div>
      </div>
    </article>
  );
}

export function CandidateCardOverlay({ application }: CandidateCardOverlayProps) {
  const fullName = `${application.candidateFirstName} ${application.candidateLastName}`;

  return (
    <article
      className={cn(
        "w-72 cursor-grabbing rounded-lg border border-l-2 bg-card p-3 shadow-2xl",
        accentStyles[application.status],
      )}
    >
      <div className="flex items-start gap-2.5">
        <UserAvatar name={fullName} size="sm" />
        <CandidateCardContent application={application} />
      </div>
    </article>
  );
}
