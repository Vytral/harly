"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, SearchX } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { TaskItem } from "./shared";
import { TaskRow } from "./TaskRow";
import {
  URGENCY_DOT,
  URGENCY_LABEL,
  URGENCY_ORDER,
  startOfToday,
  urgencyOf,
  type TaskHandlers,
  type UrgencyKey,
} from "./task-ui";

type Group = {
  key: UrgencyKey | "completed" | "canceled";
  label: string;
  dot: string;
  tasks: TaskItem[];
};

export function TaskList({
  tasks,
  handlers,
  filtersActive = false,
}: {
  tasks: TaskItem[];
  handlers: TaskHandlers;
  /** Lets the empty state tell "nothing exists" apart from "nothing matches". */
  filtersActive?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["completed", "canceled"]));

  const groups = useMemo<Group[]>(() => {
    const todayStart = startOfToday();
    const open = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
    const done = tasks.filter((t) => t.status === "completed");
    const canceled = tasks.filter((t) => t.status === "canceled");

    const byUrgency: Group[] = URGENCY_ORDER.map((key) => ({
      key,
      label: URGENCY_LABEL[key],
      dot: URGENCY_DOT[key],
      tasks: open.filter((t) => urgencyOf(t.dueDate, todayStart) === key),
    })).filter((g) => g.tasks.length > 0);

    if (done.length > 0) {
      byUrgency.push({ key: "completed", label: "Completed", dot: "bg-primary", tasks: done });
    }
    if (canceled.length > 0) {
      byUrgency.push({ key: "canceled", label: "Canceled", dot: "bg-muted-foreground/40", tasks: canceled });
    }
    return byUrgency;
  }, [tasks]);

  if (tasks.length === 0) {
    return filtersActive ? (
      <EmptyState
        variant="filtered"
        icon={SearchX}
        title="No tasks match these filters"
        hint="Try a different assignee or due window, or reset the filters."
      />
    ) : (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing on your plate"
        hint="Tasks you create , or that a stage move assigns you , collect here with the most urgent first."
      />
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key);
        return (
          <section key={group.key}>
            <button
              type="button"
              onClick={() =>
                setCollapsed((cur) => {
                  const next = new Set(cur);
                  if (next.has(group.key)) next.delete(group.key);
                  else next.add(group.key);
                  return next;
                })
              }
              className="mb-2 flex w-full items-center gap-2 text-left"
              aria-expanded={!isCollapsed}
            >
              <ChevronRight
                className={cn("size-3.5 text-muted-foreground transition-transform", !isCollapsed && "rotate-90")}
              />
              <span className={cn("size-2 rounded-full", group.dot)} />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </span>
              <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
                {group.tasks.length}
              </span>
            </button>
            {!isCollapsed && (
              <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
                {group.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} handlers={handlers} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
