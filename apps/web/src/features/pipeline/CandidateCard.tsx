"use client";

import { useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { Clock, GripVertical } from "lucide-react";

import { UserAvatar } from "@/components/ui/UserAvatar";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import type { PipelineApplication } from "@/features/pipeline/data";
import { DaysSince } from "@/lib/date-hydration";
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
  hired: "border-l-emerald-500",
  rejected: "border-l-destructive",
  withdrawn: "border-l-muted-foreground/30",
};

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
  const stageStartedAt = application.lastStageMovedAt ?? application.createdAt;

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
        "group cursor-pointer rounded-xl border-l-2 bg-card p-2.5 shadow-sm transition-all duration-150",
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
            "shrink-0 transition",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
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
          onClick={(event) => event.stopPropagation()}
          className="shrink-0 touch-none cursor-grab rounded-md p-0.5 text-muted-foreground/40 opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
          aria-label={`Drag ${fullName}`}
        >
          <GripVertical className="size-3.5" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Clock className="size-2.5" />
          <DaysSince value={stageStartedAt} />d
        </span>
        {application.source ? (
          <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {application.source}
          </span>
        ) : null}
        {application.status !== "active" ? (
          <ApplicationStatusBadge status={application.status} />
        ) : null}
      </div>

      <div className="mt-2 flex justify-end gap-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onStatusChange([application.id], "hired");
          }}
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50 active:scale-[0.97] dark:text-emerald-400 dark:hover:bg-emerald-950"
        >
          Hire
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onStatusChange([application.id], "rejected");
          }}
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-destructive transition hover:bg-destructive/10 active:scale-[0.97]"
        >
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
        "w-56 cursor-grabbing rounded-xl border-l-2 bg-card p-2.5 shadow-2xl lg:w-64",
        accentStyles[application.status],
      )}
    >
      <div className="flex items-center gap-2">
        <UserAvatar name={fullName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{fullName}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {application.candidateEmail}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Clock className="size-2.5" />
          <DaysSince value={stageStartedAt} />d
        </span>
        {application.status !== "active" ? (
          <ApplicationStatusBadge status={application.status} />
        ) : null}
      </div>
    </article>
  );
}
