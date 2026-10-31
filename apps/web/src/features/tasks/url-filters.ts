import { taskDueState, TASK_PRIORITIES, TASK_STATUSES, type TaskItem } from "./shared";

/**
 * Task filters that live in the URL, so a link (Home's "Tasks due") lands on
 * exactly the rows it counted and a filtered view survives a reload.
 *
 *   ?owner=me|<userId>   assignee ("me" is the viewer)
 *   ?priority=urgent     one priority
 *   ?status=pending,in_progress   one or more statuses
 *   ?due=overdue,today   one or more of overdue | today | due | no_due
 *
 * No params means no filter. Unknown values are ignored.
 */

export const FILTER_ALL = "all";

export type TaskFilters = {
  /** A user id, or {@link FILTER_ALL}. */
  assignee: string;
  priority: string;
  /** Comma-separated task statuses, or {@link FILTER_ALL}. */
  status: string;
  /** Comma-separated due tokens, or {@link FILTER_ALL}. */
  due: string;
};

/** Open work: what "overdue" and "due today" are about. */
export const OPEN_STATUSES = "pending,in_progress";

const DUE_TOKENS = ["overdue", "today", "due", "no_due"] as const;
type DueToken = (typeof DUE_TOKENS)[number];

/** Keeps known tokens in canonical order and drops the rest; "all" if none remain. */
function normalizeList(raw: string | null, allowed: readonly string[]): string {
  if (!raw) return FILTER_ALL;
  const wanted = new Set(raw.split(",").map((token) => token.trim()));
  const kept = allowed.filter((token) => wanted.has(token));
  return kept.length > 0 ? kept.join(",") : FILTER_ALL;
}

type ParamReader = { get(name: string): string | null };

export function parseTaskFilters(params: ParamReader, currentUserId: string): TaskFilters {
  const owner = params.get("owner") ?? params.get("assignee");
  const priority = params.get("priority");
  return {
    assignee: !owner ? FILTER_ALL : owner === "me" ? currentUserId : owner,
    priority: priority && (TASK_PRIORITIES as string[]).includes(priority) ? priority : FILTER_ALL,
    status: normalizeList(params.get("status"), TASK_STATUSES),
    due: normalizeList(params.get("due"), DUE_TOKENS),
  };
}

/** Returns `params` with one filter written (or removed when it is "all"). */
export function withTaskFilter(
  params: URLSearchParams,
  key: keyof TaskFilters,
  value: string,
  currentUserId: string,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const name = key === "assignee" ? "owner" : key;
  next.delete("assignee");
  if (value === FILTER_ALL) next.delete(name);
  else next.set(name, key === "assignee" && value === currentUserId ? "me" : value);
  return next;
}

export function matchesStatus(task: Pick<TaskItem, "status">, status: string): boolean {
  return status === FILTER_ALL || status.split(",").includes(task.status);
}

/** Due filters other than "has a date" speak about open work only. */
export function matchesDue(task: Pick<TaskItem, "status" | "dueDate">, due: string): boolean {
  if (due === FILTER_ALL) return true;
  const open = task.status === "pending" || task.status === "in_progress";
  const state = taskDueState(task.dueDate);
  return (due.split(",") as DueToken[]).some((token) => {
    switch (token) {
      case "overdue":
        return open && state === "overdue";
      case "today":
        return open && state === "today";
      case "due":
        return state !== null;
      case "no_due":
        return !task.dueDate;
    }
  });
}
