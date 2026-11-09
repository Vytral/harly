"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { TaskItem } from "./shared";
import { TaskRow } from "./TaskRow";
import {
  URGENCY_DOT,
  URGENCY_ORDER,
  startOfToday,
  urgencyOf,
  type TaskHandlers,
  type UrgencyKey,
} from "./task-ui";

type Group = {
  key: UrgencyKey | "completed" | "canceled";
  dot: string;
  tasks: TaskItem[];
};

type ListTranslator = ReturnType<typeof useTranslations>;

function groupLabel(t: ListTranslator, key: Group["key"]): string {
  return key === "completed" || key === "canceled" ? t(key) : t(`urgency.${key}`);
}

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
  const t = useTranslations("features.tasks.taskList");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["completed", "canceled"]));

  const groups = useMemo<Group[]>(() => {
    const todayStart = startOfToday();
    const open = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
    const done = tasks.filter((t) => t.status === "completed");
    const canceled = tasks.filter((t) => t.status === "canceled");

    const byUrgency: Group[] = URGENCY_ORDER.map((key) => ({
      key,
      dot: URGENCY_DOT[key],
      tasks: open.filter((t) => urgencyOf(t.dueDate, todayStart) === key),
    })).filter((g) => g.tasks.length > 0);

    if (done.length > 0) {
      byUrgency.push({ key: "completed", dot: "bg-success-olive", tasks: done });
    }
    if (canceled.length > 0) {
      byUrgency.push({ key: "canceled", dot: "bg-quiet-mist", tasks: canceled });
    }
    return byUrgency;
  }, [tasks]);

  if (tasks.length === 0) {
    return filtersActive ? (
      <EmptyState
        variant="filtered"
        icon={SearchX}
        title={t("emptyFilteredTitle")}
        description={t("emptyFilteredDescription")}
      />
    ) : (
      <EmptyState
        icon={CheckCircle2}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }

  return (
    <Card className="gap-0 overflow-hidden py-2">
      {groups.map((group, gi) => {
        const isCollapsed = collapsed.has(group.key);
        return (
          <section key={group.key} className={cn(gi > 0 && "border-t border-hairline")}>
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
              className="flex w-full items-center gap-2 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-near-ink"
              aria-expanded={!isCollapsed}
            >
              <ChevronRight
                className={cn("size-3.5 text-quiet-mist transition-transform", !isCollapsed && "rotate-90")}
              />
              <span aria-hidden className={cn("size-2 rounded-full", group.dot)} />
              <span className="text-[13px] font-semibold text-near-ink">{groupLabel(t, group.key)}</span>
              <span className="rounded-full bg-soft-kraft px-2 py-0.5 text-[11px] font-medium tabular-nums text-soft-ink">
                {group.tasks.length}
              </span>
            </button>
            {!isCollapsed && (
              <div className="divide-y divide-hairline border-t border-hairline">
                {group.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} handlers={handlers} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </Card>
  );
}
