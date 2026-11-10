"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { KanbanSquare, List, Plus, Search } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterPill } from "@/components/ui/FilterPill";
import { PageTitle } from "@/components/dashboard/PageTitleContext";
import { deleteTask, updateTask } from "./actions";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { EditTaskDialog } from "./EditTaskDialog";
import { TaskBoard } from "./TaskBoard";
import { TaskList } from "./TaskList";
import { type TaskHandlers } from "./task-ui";
import { taskDueState, type TaskItem, type TaskStatus } from "./shared";
import {
  FILTER_ALL,
  matchesDue,
  matchesStatus,
  OPEN_STATUSES,
  parseTaskFilters,
  withTaskFilter,
  type TaskFilters,
} from "./url-filters";
import { TASK_PRIORITIES, TASK_STATUSES } from "./shared";
import type { TaskContextOptions } from "./TaskLinkFields";
import { useOpenFromQuery } from "@/components/dashboard/use-open-from-query";

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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-pure-snow px-2.5 py-1 text-xs font-medium shadow-[var(--shadow-card)]">
      <span className={cn("size-1.5 rounded-full", tone)} />
      <span className="tabular-nums">{count}</span>
      <span className="text-soft-ink">{label}</span>
    </span>
  );
}

export function TasksView({
  tasks: initialTasks,
  members,
  contextOptions,
  currentUserId,
}: {
  tasks: TaskItem[];
  members: Member[];
  /** The viewer, so `?owner=me` can be resolved. */
  currentUserId: string;
  counts: Record<string, number>;
  contextOptions: TaskContextOptions;
}) {
  const t = useTranslations("features.tasks.tasksView");
  // Optimistic edits are derived on top of the server's `initialTasks` , a
  // status-override map plus a removed-set , so there is no prop→state mirror
  // (no setState-in-effect). After revalidation the server truth flows in and
  // each override becomes a no-op once it matches.
  const [statusOverride, setStatusOverride] = useState<Record<string, TaskStatus>>({});
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<View>("list");
  // `?new=1` (header "+" menu) opens the create sheet on arrival.
  const [createOpen, setCreateOpen] = useOpenFromQuery("new");
  const [createStatus, setCreateStatus] = useState<TaskStatus>("pending");
  const searchParams = useSearchParams();
  // `?task=<id>` (Home's task rows) opens that task for editing on arrival.
  const taskParam = searchParams.get("task");
  const [editingTask, setEditingTask] = useState<TaskItem | null>(
    () => initialTasks.find((t) => t.id === taskParam) ?? null,
  );
  const [seenTaskParam, setSeenTaskParam] = useState(taskParam);
  if (taskParam !== seenTaskParam) {
    setSeenTaskParam(taskParam);
    const requested = initialTasks.find((t) => t.id === taskParam);
    if (requested) setEditingTask(requested);
  }
  const [query, setQuery] = useState("");
  const router = useRouter();

  // Filters live in the URL (single source of truth), so a link lands on a
  // filtered list and a reload keeps it. Writes use the History API, which
  // Next syncs into useSearchParams without re-fetching the page.
  const { assignee, priority, status, due } = useMemo(
    () => parseTaskFilters(searchParams, currentUserId),
    [searchParams, currentUserId],
  );
  const setFilter = useCallback(
    (key: keyof TaskFilters, value: string) => {
      const next = withTaskFilter(new URLSearchParams(window.location.search), key, value, currentUserId);
      const qs = next.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    },
    [currentUserId],
  );

  useEffect(() => {
    if (!taskParam) return;
    const next = new URLSearchParams(window.location.search);
    next.delete("task");
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [taskParam]);
  const confirm = useConfirm();

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
        toast.error(res.error ?? t("updateFailed"));
      } else {
        router.refresh();
      }
    },
    [router, settle, t],
  );

  const runRemove = useCallback(
    async (id: string) => {
      if (
        !(await confirm({
          tone: "warning",
          title: t("archiveTitle"),
          description: t("archiveDescription"),
          confirmLabel: t("archiveConfirm"),
        }))
      )
        return;
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
        toast.error(res.error ?? t("deleteFailed"));
      } else {
        router.refresh();
      }
    },
    [confirm, router, settle, t],
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
    [pending, runStatus, runRemove, setCreateOpen],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (assignee !== FILTER_ALL && t.ownerId !== assignee) return false;
      if (priority !== FILTER_ALL && t.priority !== priority) return false;
      if (!matchesStatus(t, status)) return false;
      if (!matchesDue(t, due)) return false;
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

  const priorityLabels = Object.fromEntries(
    TASK_PRIORITIES.map((p) => [p, t(`priorities.${p}`)]),
  );
  const statusLabels = Object.fromEntries(
    TASK_STATUSES.map((s) => [s, t(`statuses.${s}`)]),
  );

  return (
    <div className="space-y-5">
      <PageTitle title={t("pageTitle")} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-quiet-mist" />
          <Input
            type="search"
            aria-label={t("searchLabel")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-full pl-9"
          />
        </div>

        <FilterPill
          label={t("assignee")}
          value={assignee}
          onChange={(v) => setFilter("assignee", v)}
          options={["all", ...members.map((m) => m.id)]}
          labelMap={{ all: t("all"), ...Object.fromEntries(members.map((m) => [m.id, m.name])) }}
          allValue="all"
        />
        <FilterPill
          label={t("priority")}
          value={priority}
          onChange={(v) => setFilter("priority", v)}
          options={["all", ...TASK_PRIORITIES]}
          labelMap={{ all: t("all"), ...priorityLabels }}
          allValue="all"
        />
        <FilterPill
          label={t("status")}
          value={status}
          onChange={(v) => setFilter("status", v)}
          options={["all", OPEN_STATUSES, ...TASK_STATUSES]}
          labelMap={{ all: t("all"), [OPEN_STATUSES]: t("open"), ...statusLabels }}
          allValue="all"
        />
        <FilterPill
          label={t("due")}
          value={due}
          onChange={(v) => setFilter("due", v)}
          options={["all", "overdue,today", "overdue", "today", "due", "no_due"]}
          labelMap={{
            all: t("all"),
            "overdue,today": t("dueOverdueOrToday"),
            overdue: t("dueOverdue"),
            today: t("dueToday"),
            due: t("dueWithDate"),
            no_due: t("dueNone"),
          }}
          allValue="all"
        />

        <div className="flex items-center gap-1.5 sm:ml-auto">
          <SummaryChip count={summary.open} label={t("summaryOpen")} tone="bg-slate-info" />
          <SummaryChip count={summary.overdue} label={t("summaryOverdue")} tone="bg-rust" />
          <SummaryChip count={summary.done} label={t("summaryDone")} tone="bg-success-olive" />
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-soft-kraft p-0.5">
            {([
              { key: "list", icon: List, label: t("listView") },
              { key: "board", icon: KanbanSquare, label: t("boardView") },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-label={label}
                aria-pressed={view === key}
                className={cn(
                  "rounded-full p-1.5 transition",
                  view === key ? "bg-pure-snow text-near-ink" : "text-soft-ink hover:text-near-ink",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
          <Button
            onClick={() => {
              setCreateStatus("pending");
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("newTask")}
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <TaskList
          tasks={filtered}
          handlers={handlers}
          filtersActive={
            query.trim() !== "" ||
            assignee !== FILTER_ALL ||
            priority !== FILTER_ALL ||
            status !== FILTER_ALL ||
            due !== FILTER_ALL
          }
        />
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
