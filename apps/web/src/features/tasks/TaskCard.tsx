"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Briefcase,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  GripVertical,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
  User,
} from "lucide-react";

import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TaskItem } from "./shared";
import { TASK_STATUS_LABELS } from "./shared";
import {
  OwnerAvatar,
  PRIORITY,
  RelativeDate,
  STATUS_COLOR,
  STATUS_ICON,
  type TaskHandlers,
} from "./task-ui";

export function TaskMenu({ task, handlers }: { task: TaskItem; handlers: TaskHandlers }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Task actions"
          onPointerDown={(e) => e.stopPropagation()}
          className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => handlers.edit(task)}>
          <Pencil className="mr-2 size-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handlers.setStatus(task.id, "pending")}>
          <Circle className="mr-2 size-4 text-muted-foreground" /> To do
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlers.setStatus(task.id, "in_progress")}>
          <Clock className="mr-2 size-4 text-clay" /> In progress
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlers.setStatus(task.id, "completed")}>
          <CheckCircle2 className="mr-2 size-4 text-primary" /> Done
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handlers.remove(task.id)} className="text-destructive">
          <Trash2 className="mr-2 size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Meta({ task }: { task: TaskItem }) {
  if (!task.candidateName && !task.jobTitle && !task.applicationId && !task.interviewId) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {task.candidateName && (
        <span className="inline-flex items-center gap-1">
          <User className="size-3" />
          {task.candidateId ? (
            <Link href={`/dashboard/candidates/${task.candidateId}`} className="hover:underline">
              {task.candidateName}
            </Link>
          ) : (
            task.candidateName
          )}
        </span>
      )}
      {task.jobTitle && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <Briefcase className="size-3 shrink-0" />
          {task.jobId ? (
            <Link href={`/dashboard/jobs/${task.jobId}`} className="truncate hover:underline">
              {task.jobTitle}
            </Link>
          ) : (
            <span className="truncate">{task.jobTitle}</span>
          )}
        </span>
      )}
      {task.applicationId && (
        <span className="inline-flex items-center gap-1">
          <FileText className="size-3" />
          {task.candidateId ? (
            <Link href={`/dashboard/candidates/${task.candidateId}`} className="hover:underline">
              Application
            </Link>
          ) : (
            "Application"
          )}
        </span>
      )}
      {task.interviewId && (
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3" />
          {task.candidateId ? (
            <Link href={`/dashboard/candidates/${task.candidateId}`} className="hover:underline">
              Interview
            </Link>
          ) : (
            "Interview"
          )}
        </span>
      )}
    </div>
  );
}

/** Presentational card , used by the draggable card and the drag overlay. */
export function TaskCardView({
  task,
  handlers,
  dragging,
  withHandle,
}: {
  task: TaskItem;
  handlers?: TaskHandlers;
  dragging?: boolean;
  withHandle?: boolean;
}) {
  const StatusIcon = STATUS_ICON[task.status];
  const prio = PRIORITY[task.priority];
  const done = task.status === "completed";

  return (
    <div
      style={{ borderLeftColor: prio.spine }}
      className={cn(
        "group rounded-xl border border-l-[3px] border-border/70 bg-card p-3.5 transition",
        dragging ? "shadow-lg ring-2 ring-primary/30" : "shadow-[0_1px_2px_rgba(23,23,23,0.04)] hover:border-foreground/15",
      )}
    >
      <div className="flex items-start gap-2.5">
        {handlers ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => handlers.cycle(task)}
            title={TASK_STATUS_LABELS[task.status]}
            aria-label={`Status: ${TASK_STATUS_LABELS[task.status]}. Advance.`}
            className={cn("mt-0.5 shrink-0 rounded-full transition hover:scale-110 active:scale-95", STATUS_COLOR[task.status])}
          >
            <StatusIcon className="size-[18px]" strokeWidth={2} />
          </button>
        ) : (
          <StatusIcon className={cn("mt-0.5 size-[18px] shrink-0", STATUS_COLOR[task.status])} strokeWidth={2} />
        )}

        <p className={cn("min-w-0 flex-1 text-sm font-medium leading-snug", done && "text-muted-foreground line-through")}>
          {task.title}
        </p>

        {withHandle && (
          <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/40 opacity-0 transition group-hover:opacity-100" />
        )}
        {handlers && <TaskMenu task={task} handlers={handlers} />}
      </div>

      <div className="mt-2.5 space-y-2 pl-[28px]">
        <Meta task={task} />
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className={cn("size-1.5 rounded-full", prio.dot)} />
            <Calendar className="size-3 text-muted-foreground/50" />
            <RelativeDate iso={task.dueDate} />
          </span>
          <OwnerAvatar name={task.ownerName} image={task.ownerImage} />
        </div>
      </div>
    </div>
  );
}

export function TaskCard({ task, handlers }: { task: TaskItem; handlers: TaskHandlers }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
  });
  const busy = handlers.pending.has(task.id);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : busy ? 0.5 : 1 }}
      className={cn("touch-none cursor-grab active:cursor-grabbing", busy && "pointer-events-none")}
      {...attributes}
      {...listeners}
    >
      <TaskCardView task={task} handlers={handlers} withHandle />
    </div>
  );
}

export function TaskCardOverlay({ task }: { task: TaskItem }) {
  return (
    <div className="w-72 rotate-1 cursor-grabbing">
      <TaskCardView task={task} dragging />
    </div>
  );
}
