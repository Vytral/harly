"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { PersonLink } from "@/components/people/PersonLink";
import {
  currentTaskDateKey,
  taskDateKey,
  type TaskItem,
  type TaskPriority,
  type TaskStatus,
} from "./shared";

// ── status + priority visual language ────────────────────────────────────────

export const STATUS_ICON: Record<TaskStatus, LucideIcon> = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  canceled: XCircle,
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  pending: "text-muted-foreground",
  in_progress: "text-clay",
  completed: "text-success-olive",
  canceled: "text-muted-foreground",
};

export const STATUS_DOT: Record<TaskStatus, string> = {
  pending: "bg-muted-foreground/40",
  in_progress: "bg-clay",
  completed: "bg-primary",
  canceled: "bg-muted-foreground/40",
};

/** Column top-accent colour, for at-a-glance board scanning. */
export const STATUS_ACCENT: Record<TaskStatus, string> = {
  pending: "var(--ink-soft)",
  in_progress: "var(--clay)",
  completed: "var(--primary)",
  canceled: "var(--ink-soft)",
};

/** Priority carries urgency through colour , muted → slate → clay → rust. */
export const PRIORITY: Record<
  TaskPriority,
  { dot: string; text: string; spine: string }
> = {
  low: { dot: "bg-quiet-mist", text: "text-soft-ink", spine: "transparent" },
  medium: { dot: "bg-slate-info", text: "text-slate-info", spine: "var(--slate-info)" },
  high: { dot: "bg-clay", text: "text-clay", spine: "var(--clay)" },
  urgent: { dot: "bg-rust", text: "text-rust", spine: "var(--rust)" },
};

// ── shared mutation handlers passed down to rows + cards ─────────────────────

export type TaskHandlers = {
  pending: Set<string>;
  cycle: (task: TaskItem) => void;
  setStatus: (id: string, status: TaskStatus) => void;
  remove: (id: string) => void;
  add: (status: TaskStatus) => void;
  edit: (task: TaskItem) => void;
};

// ── due-date urgency ─────────────────────────────────────────────────────────

export type UrgencyKey = "overdue" | "today" | "week" | "later" | "none";

const DAY = 86_400_000;

export function startOfToday(): string {
  return currentTaskDateKey();
}

/** Bucket an open task by how soon it is due , the recruiter's triage order. */
export function urgencyOf(iso: string | null, todayStart: string): UrgencyKey {
  if (!iso) return "none";
  const due = taskDateKey(iso);
  const today = todayStart;
  if (!due) return "none";
  if (due < today) return "overdue";
  if (due === today) return "today";
  const daysAway = Math.round(
    (Date.parse(`${due}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / DAY,
  );
  if (daysAway < 7) return "week";
  return "later";
}

export const URGENCY_ORDER: UrgencyKey[] = ["overdue", "today", "week", "later", "none"];

export const URGENCY_LABEL: Record<UrgencyKey, string> = {
  overdue: "Overdue",
  today: "Due today",
  week: "This week",
  later: "Later",
  none: "No due date",
};

export const URGENCY_DOT: Record<UrgencyKey, string> = {
  overdue: "bg-danger-rust",
  today: "bg-warning-clay",
  week: "bg-slate-info",
  later: "bg-quiet-mist",
  none: "bg-quiet-mist/60",
};

// ── small shared pieces ──────────────────────────────────────────────────────

export function RelativeDate({ iso }: { iso: string | null }) {
  // Reading the clock is impure, so it lives in useMemo (not the render body).
  const view = useMemo(() => {
    if (!iso) return { label: "No date", cls: "text-quiet-mist", dot: "bg-quiet-mist/60" };
    const dateKey = taskDateKey(iso);
    if (!dateKey) return { label: "No date", cls: "text-quiet-mist", dot: "bg-quiet-mist/60" };
    const d = new Date(`${dateKey}T12:00:00`);
    const label = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(d);
    const today = currentTaskDateKey();
    if (dateKey < today) return { label, cls: "text-danger-rust", dot: "bg-danger-rust" };
    if (dateKey === today) return { label, cls: "text-warning-clay", dot: "bg-warning-clay" };
    const daysAway = Math.round((Date.parse(`${dateKey}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / DAY);
    if (daysAway <= 2) return { label, cls: "text-warning-clay", dot: "bg-warning-clay" };
    return { label, cls: "text-soft-ink", dot: "bg-quiet-mist" };
  }, [iso]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-card-inset px-2.5 py-1 text-xs font-medium tabular-nums",
        view.cls,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", view.dot)} />
      {view.label}
    </span>
  );
}

export function OwnerAvatar({
  name,
  image,
  username,
}: {
  name: string;
  image: string | null;
  username?: string | null;
}) {
  return (
    <PersonLink username={username}>
      <UserAvatar name={name} src={image} size="sm" className="size-6 text-[10px] ring-2 ring-card" />
    </PersonLink>
  );
}
