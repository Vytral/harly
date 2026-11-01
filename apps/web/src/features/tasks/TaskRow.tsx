"use client";

import { Briefcase, CalendarClock, FileText, User } from "lucide-react";
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

const chipCls =
  "inline-flex items-center gap-1 rounded-full bg-card-inset px-2 py-0.5";

export function TaskRow({ task, handlers }: { task: TaskItem; handlers: TaskHandlers }) {
  const StatusIcon = STATUS_ICON[task.status];
  const prio = PRIORITY[task.priority];
  const done = task.status === "completed";
  const busy = handlers.pending.has(task.id);

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-row-wash",
        busy && "pointer-events-none opacity-50",
      )}
    >
      <button
        type="button"
        onClick={() => handlers.cycle(task)}
        title={TASK_STATUS_LABELS[task.status]}
        aria-label={`Status: ${TASK_STATUS_LABELS[task.status]}. Advance.`}
        className={cn(
          "shrink-0 rounded-full transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink active:scale-95",
          STATUS_COLOR[task.status],
        )}
      >
        <StatusIcon className="size-5" strokeWidth={1.8} />
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium leading-snug text-near-ink", done && "text-quiet-mist line-through")}>
          {task.title}
        </p>
        {(task.candidateName || task.jobTitle || task.applicationId || task.interviewId) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-soft-ink">
            {task.candidateName && (
              <span className={chipCls}>
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
              <span className={cn(chipCls, "min-w-0")}>
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
              <span className={chipCls}>
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
              <span className={chipCls}>
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

      <div className="flex shrink-0 items-center gap-3">
        <span className={cn("hidden items-center gap-1.5 text-xs font-medium sm:inline-flex", prio.text)}>
          <span aria-hidden className={cn("size-1.5 rounded-full", prio.dot)} />
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
        <span className="hidden sm:inline-flex">
          <RelativeDate iso={task.dueDate} />
        </span>
        <OwnerAvatar name={task.ownerName} image={task.ownerImage} username={task.ownerUsername} />
        <TaskMenu task={task} handlers={handlers} />
      </div>
    </div>
  );
}
