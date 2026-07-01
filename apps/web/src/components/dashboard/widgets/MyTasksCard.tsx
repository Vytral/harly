import Link from "next/link";
import type { Route } from "next";
import { CheckSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MyDashboardTask } from "@/features/dashboard/widgets";
import { Tile, TileHeader, TileLink, EmptyHint } from "./primitives";

const priorityVariant: Record<
  MyDashboardTask["priority"],
  "destructive" | "danger" | "warning" | "secondary"
> = {
  urgent: "destructive",
  high: "danger",
  medium: "warning",
  low: "secondary",
};

const priorityLabel: Record<MyDashboardTask["priority"], string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const dueStateClass: Record<string, string> = {
  overdue: "text-destructive",
  today: "text-warning",
  soon: "text-muted-foreground",
};

function formatDue(task: MyDashboardTask): string | null {
  if (!task.dueDate) return null;
  if (task.dueState === "overdue") return "Overdue";
  if (task.dueState === "today") return "Due today";
  const d = new Date(task.dueDate);
  return `Due ${d.toLocaleDateString("en", { month: "short", day: "numeric" })}`;
}

export function MyTasksCard({
  tasks,
  className,
}: {
  tasks: MyDashboardTask[];
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeader
        icon={CheckSquare}
        title="My tasks"
        action={<TileLink href="/dashboard/tasks">View all</TileLink>}
      />
      <div className="flex flex-1 flex-col px-2 pb-2 pt-1">
        {tasks.length > 0 ? (
          <ul className="flex-1 divide-y divide-border/60">
            {tasks.map((task) => {
              const due = formatDue(task);
              const href = task.candidateId
                ? (`/dashboard/candidates/${task.candidateId}` as Route)
                : ("/dashboard/tasks" as Route);

              return (
                <li key={task.id}>
                  <Link
                    href={href}
                    className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <div className="flex items-center gap-2">
                        {task.context && (
                          <p className="truncate text-xs text-muted-foreground">
                            {task.context}
                          </p>
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
        <Button asChild variant="outline" size="sm" className="mt-2 w-full">
          <Link href="/dashboard/tasks">
            <CheckSquare className="size-4" strokeWidth={1.8} />
            Go to tasks
          </Link>
        </Button>
      </div>
    </Tile>
  );
}
