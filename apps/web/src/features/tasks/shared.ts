export type TaskStatus = "pending" | "in_progress" | "completed" | "canceled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  ownerId: string;
  ownerName: string;
  ownerImage: string | null;
  ownerUsername: string | null;
  candidateId: string | null;
  candidateName: string | null;
  applicationId: string | null;
  jobId: string | null;
  jobTitle: string | null;
  interviewId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "To do",
  in_progress: "In progress",
  completed: "Done",
  canceled: "Canceled",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const TASK_STATUSES: TaskStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "canceled",
];

export const TASK_PRIORITIES: TaskPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

/** Date-only task values are stored at UTC midnight; keep comparisons based on
 * the intended calendar day instead of the browser/server timezone. */
export function taskDateKey(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

export function currentTaskDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function taskDueState(
  iso: string | null,
  now = new Date(),
): "overdue" | "today" | "soon" | null {
  const due = taskDateKey(iso);
  if (!due) return null;
  const today = currentTaskDateKey(now);
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "soon";
}
