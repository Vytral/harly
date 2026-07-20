"use client";

import { Briefcase, Calendar, CalendarClock, FileText, Flag, User } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { TaskItem } from "./shared";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "./shared";
import { TaskMenu } from "./TaskCard";
import {
  OwnerAvatar,
  PRIORITY,
  RelativeDate,
  STATUS_COLOR,
  STATUS_ICON,
  type TaskHandlers,
} from "./task-ui";

export function TaskRow({ task, handlers }: { task: TaskItem; handlers: TaskHandlers }) {
  const StatusIcon = STATUS_ICON[task.status];
  const prio = PRIORITY[task.priority];
  const done = task.status === "completed";
  const busy = handlers.pending.has(task.id);

  return (
    <div
      style={{ borderLeftColor: prio.spine }}
      className={cn(
        "group flex items-center gap-3 border-l-[3px] px-4 py-3.5 transition-colors hover:bg-muted/40",
        busy && "pointer-events-none opacity-50",
      )}
    >
      <button
        type="button"
        onClick={() => handlers.cycle(task)}
        title={TASK_STATUS_LABELS[task.status]}
        aria-label={`Status: ${TASK_STATUS_LABELS[task.status]}. Advance.`}
        className={cn("shrink-0 rounded-full transition hover:scale-110 active:scale-95", STATUS_COLOR[task.status])}
      >
        <StatusIcon className="size-5" strokeWidth={2} />
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium leading-snug", done && "text-muted-foreground line-through")}>
          {task.title}
        </p>
        {(task.candidateName || task.jobTitle || task.applicationId || task.interviewId) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
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
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <span className={cn("hidden items-center gap-1.5 text-xs font-medium sm:inline-flex", prio.text)}>
          <Flag className="size-3.5" strokeWidth={2} />
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
        <span className="hidden w-16 items-center gap-1.5 text-xs sm:inline-flex">
          <Calendar className="size-3.5 text-muted-foreground/50" />
          <RelativeDate iso={task.dueDate} />
        </span>
        <OwnerAvatar name={task.ownerName} image={task.ownerImage} />
        <TaskMenu task={task} handlers={handlers} />
      </div>
    </div>
  );
}
