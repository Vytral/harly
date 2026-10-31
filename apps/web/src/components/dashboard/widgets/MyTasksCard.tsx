"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { CheckSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { updateTask } from "@/features/tasks/actions";
import { toast } from "@/lib/notification-island/toast";
import type { MyDashboardTask } from "@/features/dashboard/widgets";
import { Tile, TileHeader, TileLink, EmptyHint } from "./primitives";

const priorityVariant: Record<
  MyDashboardTask["priority"],
  "danger" | "warning" | "neutral"
> = {
  urgent: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
};

const priorityLabel: Record<MyDashboardTask["priority"], string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const dueStateClass: Record<string, string> = {
  overdue: "text-danger-rust",
  today: "text-warning-clay",
  soon: "text-soft-ink",
};

function formatDue(task: MyDashboardTask): string | null {
  if (!task.dueDate) return null;
  if (task.dueState === "overdue") return "Overdue";
  if (task.dueState === "today") return "Due today";
  const d = new Date(task.dueDate);
  return `Due ${d.toLocaleDateString("en", { month: "short", day: "numeric" })}`;
}

const OPEN_TASKS_HREF = "/dashboard/tasks?owner=me&status=pending,in_progress" as Route;

/**
 * My open tasks. The checkbox completes a task in place (optimistic; the row
 * comes back with an error toast if the server refuses) and the row opens the
 * task on the Tasks page.
 */
export function MyTasksCard({
  tasks,
  className,
}: {
  tasks: { total: number; items: MyDashboardTask[] };
  className?: string;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set());

  async function complete(id: string) {
    setCompleted((prev) => new Set(prev).add(id));
    const res = await updateTask({ taskId: id, status: "completed" });
    if (!res.success) {
      setCompleted((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error(res.error ?? "Couldn't complete task.");
      return;
    }
    router.refresh();
  }

  const items = tasks.items.filter((task) => !completed.has(task.id));
  const total = tasks.total - (tasks.items.length - items.length);

  return (
    <Tile className={className}>
      <TileHeader
        icon={CheckSquare}
        title="My tasks"
        count={total}
        action={<TileLink href={OPEN_TASKS_HREF}>View all</TileLink>}
      />
      <div className="flex flex-1 flex-col px-2 pb-3 pt-3">
        {items.length > 0 ? (
          <ul className="flex-1 flex flex-col gap-0.5">
            {items.map((task) => {
              const due = formatDue(task);
              return (
                <li
                  key={task.id}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] pl-3 pr-3 transition-colors hover:bg-row-wash"
                >
                  <Checkbox
                    aria-label={`Mark "${task.title}" as done`}
                    checked={false}
                    onCheckedChange={() => void complete(task.id)}
                  />
                  <Link
                    href={`/dashboard/tasks?task=${task.id}` as Route}
                    className="group flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-md)] py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <div className="flex items-center gap-2">
                        {task.context && (
                          <p className="truncate text-xs text-soft-ink">{task.context}</p>
                        )}
                        {due && (
                          <p className={`shrink-0 text-xs font-medium ${dueStateClass[task.dueState ?? "soon"]}`}>
                            {due}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant={priorityVariant[task.priority]} className="shrink-0">
                      {priorityLabel[task.priority]}
                    </Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyHint icon={CheckSquare} text="No pending tasks. You're all caught up." />
        )}
        {total > items.length ? (
          <Link
            href={OPEN_TASKS_HREF}
            className="mx-3 mt-1 rounded-[var(--radius-md)] px-3 py-2.5 text-center text-xs font-medium text-soft-ink transition hover:bg-row-wash"
          >
            {total - items.length} more open tasks
          </Link>
        ) : null}
        <Button asChild variant="outline" size="sm" className="mt-2 w-full">
          <Link href={OPEN_TASKS_HREF}>
            <CheckSquare className="size-4" strokeWidth={1.8} />
            Go to tasks
          </Link>
        </Button>
      </div>
    </Tile>
  );
}
