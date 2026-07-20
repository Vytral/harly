"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KanbanSquare, List, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EditTaskDialog } from "./EditTaskDialog";
import { TaskBoard } from "./TaskBoard";
import { TaskList } from "./TaskList";
import { type TaskHandlers } from "./task-ui";
import { taskDueState, type TaskItem, type TaskStatus } from "./shared";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS } from "./shared";
import type { TaskContextOptions } from "./TaskLinkFields";

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
  contextOptions,
}: {
  tasks: TaskItem[];
  members: Member[];
  counts: Record<string, number>;
  contextOptions: TaskContextOptions;
}) {
  // Optimistic edits are derived on top of the server's `initialTasks` , a
  // status-override map plus a removed-set , so there is no prop→state mirror
  // (no setState-in-effect). After revalidation the server truth flows in and
  // each override becomes a no-op once it matches.
  const [statusOverride, setStatusOverride] = useState<Record<string, TaskStatus>>({});
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<View>("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>("pending");
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [due, setDue] = useState("all");
  const router = useRouter();

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
      } else {
        router.refresh();
      }
    },
    [router, settle],
  );

  const runRemove = useCallback(
    async (id: string) => {
      if (!window.confirm("Archive this task? It will leave the active task list.")) return;
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
      } else {
        router.refresh();
      }
    },
    [router, settle],
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
      edit: (task) => setEditingTask(task),
    }),
    [pending, runStatus, runRemove],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (assignee !== "all" && t.ownerId !== assignee) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (status !== "all" && t.status !== status) return false;
      const dueState = taskDueState(t.dueDate);
      if (due === "due" && !dueState) return false;
      if (due === "overdue" && dueState !== "overdue") return false;
      if (due === "no_due" && t.dueDate) return false;
      if (!q) return true;
      return [t.title, t.candidateName, t.jobTitle, t.ownerName]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [tasks, query, assignee, priority, status, due]);

  const summary = useMemo(() => {
    let open = 0;
    let overdue = 0;
    let done = 0;
    for (const t of tasks) {
      if (t.status === "completed") done += 1;
      else if (t.status === "pending" || t.status === "in_progress") {
        open += 1;
        if (taskDueState(t.dueDate) === "overdue") overdue += 1;
      }
    }
    return { open, overdue, done };
  }, [tasks]);

  return (
    <div className="space-y-5">
      <PageTitle title="Tasks" />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:w-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search tasks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="w-full pl-9"
          />
        </div>

        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger aria-label="Filter by assignee" className="w-full sm:w-44">
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
          <SelectTrigger aria-label="Filter by priority" className="w-full sm:w-36">
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

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Filter by status" className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TASK_STATUSES.map((item) => (
              <SelectItem key={item} value={item}>{TASK_STATUS_LABELS[item]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={due} onValueChange={setDue}>
          <SelectTrigger aria-label="Filter by due date" className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All due dates</SelectItem>
            <SelectItem value="due">With due date</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="no_due">No due date</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 sm:ml-auto">
          <SummaryChip count={summary.open} label="open" tone="bg-slate-info" />
          <SummaryChip count={summary.overdue} label="overdue" tone="bg-rust" />
          <SummaryChip count={summary.done} label="done" tone="bg-primary" />
        </div>

        <div className="flex items-center gap-2">
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
        contextOptions={contextOptions}
      />

      <EditTaskDialog
        open={editingTask !== null}
        onOpenChange={(v) => { if (!v) setEditingTask(null); }}
        task={editingTask}
        members={members}
        contextOptions={contextOptions}
        onSave={() => {
          setEditingTask(null);
          router.refresh();
        }}
      />
    </div>
  );
}
