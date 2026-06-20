"use client";

import { useCallback, useMemo, useState } from "react";
import { KanbanSquare, List, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageTitle } from "@/components/dashboard/PageTitleContext";
import { deleteTask, updateTask } from "./actions";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskBoard } from "./TaskBoard";
import { TaskList } from "./TaskList";
import { startOfToday, type TaskHandlers } from "./task-ui";
import type { TaskItem, TaskStatus } from "./shared";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "./shared";

type Member = { id: string; name: string; image: string | null };
type View = "list" | "board";

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  pending: "in_progress",
  in_progress: "completed",
  completed: "pending",
  canceled: "pending",
};

function SummaryChip({ count, label, tone }: { count: number; label: string; tone: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium">
      <span className={cn("size-1.5 rounded-full", tone)} />
      <span className="tabular-nums">{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

export function TasksView({
  tasks: initialTasks,
  members,
}: {
  tasks: TaskItem[];
  members: Member[];
  counts: Record<string, number>;
}) {
  // Optimistic edits are derived on top of the server's `initialTasks` — a
  // status-override map plus a removed-set — so there is no prop→state mirror
  // (no setState-in-effect). After revalidation the server truth flows in and
  // each override becomes a no-op once it matches.
  const [statusOverride, setStatusOverride] = useState<Record<string, TaskStatus>>({});
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<View>("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>("pending");
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [priority, setPriority] = useState("all");

  const tasks = useMemo(
    () =>
      initialTasks
        .filter((t) => !removed.has(t.id))
        .map((t) => {
          const ov = statusOverride[t.id];
          return ov && ov !== t.status ? { ...t, status: ov } : t;
        }),
    [initialTasks, statusOverride, removed],
  );

  const settle = useCallback((id: string) => {
    setPending((p) => {
      const next = new Set(p);
      next.delete(id);
      return next;
    });
  }, []);

  const runStatus = useCallback(
    async (id: string, status: TaskStatus) => {
      setPending((p) => new Set(p).add(id));
      setStatusOverride((o) => ({ ...o, [id]: status }));
      const res = await updateTask({ taskId: id, status });
      settle(id);
      // Drop the override either way: on success the server (via revalidate) is
      // now authoritative, so keeping it would mask later concurrent updates.
      setStatusOverride((o) => {
        if (!(id in o)) return o;
        const next = { ...o };
        delete next[id];
        return next;
      });
      if (!res.success) {
        toast.error(res.error ?? "Couldn't update task.");
      }
    },
    [settle],
  );

  const runRemove = useCallback(
    async (id: string) => {
      setPending((p) => new Set(p).add(id));
      setRemoved((r) => new Set(r).add(id));
      const res = await deleteTask(id);
      settle(id);
      if (!res.success) {
        setRemoved((r) => {
          const next = new Set(r);
          next.delete(id);
          return next;
        });
        toast.error(res.error ?? "Couldn't delete task.");
      }
    },
    [settle],
  );

  const handlers = useMemo<TaskHandlers>(
    () => ({
      pending,
      cycle: (task) => runStatus(task.id, NEXT_STATUS[task.status]),
      setStatus: (id, status) => runStatus(id, status),
      remove: (id) => runRemove(id),
      add: (status) => {
        setCreateStatus(status);
        setCreateOpen(true);
      },
    }),
    [pending, runStatus, runRemove],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (assignee !== "all" && t.ownerId !== assignee) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (!q) return true;
      return [t.title, t.candidateName, t.jobTitle, t.ownerName]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [tasks, query, assignee, priority]);

  const summary = useMemo(() => {
    const todayStart = startOfToday();
    let open = 0;
    let overdue = 0;
    let done = 0;
    for (const t of tasks) {
      if (t.status === "completed") done += 1;
      else if (t.status === "pending" || t.status === "in_progress") {
        open += 1;
        if (t.dueDate && new Date(t.dueDate).getTime() < todayStart) overdue += 1;
      }
    }
    return { open, overdue, done };
  }, [tasks]);

  return (
    <div className="space-y-5">
      <PageTitle title="Tasks" />

      <PageHeader
        eyebrow="Workspace"
        title="Tasks"
        description="Follow-ups across candidates, jobs, and interviews — triaged by urgency."
        actions={
          <div className="flex items-center gap-1.5">
            <SummaryChip count={summary.open} label="open" tone="bg-slate-info" />
            <SummaryChip count={summary.overdue} label="overdue" tone="bg-rust" />
            <SummaryChip count={summary.done} label="done" tone="bg-primary" />
          </div>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:w-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="w-full pl-9"
          />
        </div>

        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="inline-flex rounded-full border bg-card p-0.5">
            {([
              { key: "list", icon: List, label: "List view" },
              { key: "board", icon: KanbanSquare, label: "Board view" },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-label={label}
                aria-pressed={view === key}
                className={cn(
                  "rounded-full p-1.5 transition",
                  view === key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => {
              setCreateStatus("pending");
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-1.5 size-4" />
            New task
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <TaskList tasks={filtered} handlers={handlers} />
      ) : (
        <TaskBoard tasks={filtered} handlers={handlers} />
      )}

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        members={members}
        defaultStatus={createStatus}
      />
    </div>
  );
}
