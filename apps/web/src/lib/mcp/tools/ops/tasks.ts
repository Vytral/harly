import "server-only";

import { z } from "zod";

import { createTask, deleteTask, updateTask } from "@/features/tasks/actions";
import {
  getMyTasksDueCount,
  getTask,
  getTaskCounts,
  listTasks,
  listWorkspaceMembers,
} from "@/features/tasks/data";
import {
  taskDueState,
  type TaskItem,
} from "@/features/tasks/shared";
import {
  listNotifications,
  type NotificationItem,
} from "@/features/notifications/data";
import {
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from "@/features/notifications/actions";

import { defineMcpTool, McpToolError, type McpToolDefinition } from "../../types";
import {
  appLink,
  assertActionOk,
  matchesQuery,
  pageFields,
  paginateArray,
} from "./shared";

const statusEnum = z.enum(["pending", "in_progress", "completed", "canceled"]);
const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);
const dueDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date like 2026-11-05.");
const DUE_DESC = "Due date as YYYY-MM-DD (a calendar day, no time).";

/** Compact task shape returned by every tasks tool. Pure; exported for tests. */
export function formatTask(task: TaskItem, origin: string, now = new Date()) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    dueState: task.status === "pending" || task.status === "in_progress" ? taskDueState(task.dueDate, now) : null,
    completedAt: task.completedAt,
    owner: { id: task.ownerId, name: task.ownerName },
    candidate: task.candidateId ? { id: task.candidateId, name: task.candidateName } : null,
    applicationId: task.applicationId,
    job: task.jobId ? { id: task.jobId, title: task.jobTitle } : null,
    interviewId: task.interviewId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    url: appLink(origin, "/dashboard/tasks"),
  };
}

const DUE_FILTERS = ["overdue", "today", "upcoming", "no_due"] as const;

/** Pure filter used by tasks_list so the rules are testable. */
export function filterTasks(
  tasks: TaskItem[],
  filters: {
    statuses: string[];
    due?: (typeof DUE_FILTERS)[number];
    candidateId?: string;
    jobId?: string;
    query?: string;
  },
  now = new Date(),
): TaskItem[] {
  return tasks.filter((task) => {
    if (!filters.statuses.includes(task.status)) return false;
    if (filters.candidateId && task.candidateId !== filters.candidateId) return false;
    if (filters.jobId && task.jobId !== filters.jobId) return false;
    if (!matchesQuery(filters.query, task.title, task.description, task.candidateName, task.jobTitle)) return false;
    if (filters.due) {
      const state = taskDueState(task.dueDate, now);
      if (filters.due === "no_due") return state === null;
      if (state === null) return false;
      if (filters.due === "upcoming") return state === "soon";
      return state === filters.due;
    }
    return true;
  });
}

async function fetchTask(taskId: string): Promise<TaskItem> {
  const task = await getTask(taskId);
  if (!task) throw new McpToolError("Task not found, or it is outside your access.", "not_found");
  return task;
}

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export function formatNotification(item: NotificationItem, origin: string) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    read: item.read,
    actor: item.actorName,
    createdAt: item.createdAt,
    url: item.href ? appLink(origin, item.href) : null,
  };
}

export const tasksTools: McpToolDefinition[] = [
  defineMcpTool({
    name: "tasks_list",
    title: "List tasks",
    description:
      "List tasks you can see. Defaults to YOUR open tasks (to do + in progress), most urgent first. Use scope=all to see the whole team's tasks you are allowed to view, or ownerId (from tasks_list_assignees) for one teammate. Filter by due date (overdue, today, upcoming, no_due), priority, status, a linked candidate (candidateId) or job (jobId), or free text. Returns compact task rows with ids for tasks_get / tasks_update / tasks_complete.",
    group: "tasks",
    scope: "tasks:read",
    permission: "tasks:read",
    annotations: READ,
    input: z.object({
      scope: z.enum(["mine", "all"]).default("mine").describe("mine = tasks assigned to you; all = every task visible to your role."),
      ownerId: z.string().optional().describe("Only tasks assigned to this user id (overrides scope). Get ids from tasks_list_assignees."),
      status: z
        .array(statusEnum)
        .optional()
        .describe("Statuses to include. Default: pending and in_progress. Add completed / canceled to see closed tasks."),
      priority: priorityEnum.optional().describe("Only this priority."),
      due: z.enum(DUE_FILTERS).optional().describe("overdue = past due and open, today, upcoming = due later, no_due = no due date."),
      candidateId: z.string().uuid().optional().describe("Only tasks linked to this candidate (id from candidates_search)."),
      jobId: z.string().uuid().optional().describe("Only tasks linked to this job (id from jobs_list)."),
      query: z.string().trim().max(120).optional().describe("Free text matched against title, description, candidate and job names."),
      ...pageFields,
    }),
    async run(input, ctx) {
      const ownerId = input.ownerId ?? (input.scope === "mine" ? ctx.userId : undefined);
      const rows = await listTasks({ ownerId, priority: input.priority });
      const filtered = filterTasks(rows, {
        statuses: input.status ?? ["pending", "in_progress"],
        due: input.due,
        candidateId: input.candidateId,
        jobId: input.jobId,
        query: input.query,
      });
      const page = paginateArray(filtered, input.limit, input.offset);
      return { ...page, items: page.items.map((task) => formatTask(task, ctx.appOrigin)) };
    },
  }),

  defineMcpTool({
    name: "tasks_get",
    title: "Get a task",
    description: "Read one task by id (from tasks_list): title, description, status, priority, due date, owner and the candidate / job / interview it is linked to.",
    group: "tasks",
    scope: "tasks:read",
    permission: "tasks:read",
    annotations: READ,
    input: z.object({ taskId: z.string().uuid().describe("Task id from tasks_list.") }),
    async run(input, ctx) {
      return formatTask(await fetchTask(input.taskId), ctx.appOrigin);
    },
  }),

  defineMcpTool({
    name: "tasks_summary",
    title: "Task counts and what is due",
    description:
      "Quick task overview: how many tasks exist per status (within your visibility), and how many of YOUR open tasks are overdue or due in the next 7 days. Use it for 'what is on my plate' before tasks_list.",
    group: "tasks",
    scope: "tasks:read",
    permission: "tasks:read",
    annotations: READ,
    input: z.object({}),
    async run(_input, ctx) {
      const [counts, myDueSoon] = await Promise.all([getTaskCounts(), getMyTasksDueCount()]);
      return { countsByStatus: counts, myOpenTasksDueWithin7Days: myDueSoon, url: appLink(ctx.appOrigin, "/dashboard/tasks") };
    },
  }),

  defineMcpTool({
    name: "tasks_list_assignees",
    title: "List task assignees",
    description: "List workspace members a task can be assigned to (id + name). Use the id as ownerId in tasks_create, tasks_assign, tasks_update or tasks_list.",
    group: "tasks",
    scope: "tasks:read",
    permission: "tasks:read",
    annotations: READ,
    input: z.object({ query: z.string().trim().max(120).optional().describe("Filter by name."), ...pageFields }),
    async run(input) {
      const members = await listWorkspaceMembers();
      const filtered = members.filter((member) => matchesQuery(input.query, member.name));
      const page = paginateArray(filtered, input.limit, input.offset);
      return { ...page, items: page.items.map((member) => ({ id: member.id, name: member.name })) };
    },
  }),

  defineMcpTool({
    name: "tasks_create",
    title: "Create a task",
    description:
      "Create a task. Assigned to you unless ownerId is set (the assignee gets a notification). Optionally link it to a candidate, application, job or interview using ids from the other tools; links outside your access are refused. Returns the created task.",
    group: "tasks",
    scope: "tasks:write",
    permission: "tasks:write",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    input: z.object({
      title: z.string().trim().min(1).max(200).describe("Short task title."),
      description: z.string().trim().max(2000).optional().describe("Longer notes."),
      priority: priorityEnum.default("medium").describe("low, medium, high or urgent."),
      dueDate: dueDateField.optional().describe(DUE_DESC),
      ownerId: z.string().optional().describe("Assignee user id (tasks_list_assignees). Default: you."),
      candidateId: z.string().uuid().optional().describe("Link to this candidate."),
      applicationId: z.string().uuid().optional().describe("Link to this application."),
      jobId: z.string().uuid().optional().describe("Link to this job."),
      interviewId: z.string().uuid().optional().describe("Link to this interview."),
    }),
    async run(input, ctx) {
      const result = assertActionOk(
        await createTask({
          title: input.title,
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate,
          ownerId: input.ownerId ?? ctx.userId,
          candidateId: input.candidateId,
          applicationId: input.applicationId,
          jobId: input.jobId,
          interviewId: input.interviewId,
        }),
        "Could not create the task.",
      );
      if (!result.taskId) throw new McpToolError("The task was not created.", "unavailable");
      return formatTask(await fetchTask(result.taskId), ctx.appOrigin);
    },
  }),

  defineMcpTool({
    name: "tasks_update",
    title: "Update a task",
    description:
      "Change fields of a task: title, description, priority, status, due date, assignee or links. Only the fields you pass change; pass dueDate=null to clear the due date, and candidateId/applicationId/jobId/interviewId=null to unlink. To just finish or reopen a task prefer tasks_complete / tasks_reopen; to reassign prefer tasks_assign. Returns the updated task.",
    group: "tasks",
    scope: "tasks:write",
    permission: "tasks:write",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({
      taskId: z.string().uuid().describe("Task id from tasks_list."),
      title: z.string().trim().min(1).max(200).optional().describe("New title."),
      description: z.string().trim().max(2000).nullable().optional().describe("New description, or null to clear."),
      priority: priorityEnum.optional().describe("low, medium, high or urgent."),
      status: statusEnum.optional().describe("pending (to do), in_progress, completed or canceled."),
      dueDate: dueDateField.nullable().optional().describe("YYYY-MM-DD, or null to clear the due date."),
      ownerId: z.string().optional().describe("Reassign to this user id."),
      candidateId: z.string().uuid().nullable().optional().describe("Link to this candidate, or null to unlink."),
      applicationId: z.string().uuid().nullable().optional().describe("Link to this application, or null to unlink."),
      jobId: z.string().uuid().nullable().optional().describe("Link to this job, or null to unlink."),
      interviewId: z.string().uuid().nullable().optional().describe("Link to this interview, or null to unlink."),
    }),
    async run(input, ctx) {
      const { taskId, ...fields } = input;
      assertActionOk(
        await updateTask({ taskId, ...fields }),
        "Could not update the task.",
      );
      return formatTask(await fetchTask(taskId), ctx.appOrigin);
    },
  }),

  defineMcpTool({
    name: "tasks_complete",
    title: "Complete a task",
    description: "Mark a task as completed (sets completedAt). Safe to repeat. Use tasks_reopen to undo.",
    group: "tasks",
    scope: "tasks:write",
    permission: "tasks:write",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({ taskId: z.string().uuid().describe("Task id from tasks_list.") }),
    async run(input, ctx) {
      assertActionOk(await updateTask({ taskId: input.taskId, status: "completed" }), "Could not complete the task.");
      return formatTask(await fetchTask(input.taskId), ctx.appOrigin);
    },
  }),

  defineMcpTool({
    name: "tasks_reopen",
    title: "Reopen a task",
    description: "Reopen a completed or canceled task (status becomes to do, or in progress when inProgress=true) and clear its completion time.",
    group: "tasks",
    scope: "tasks:write",
    permission: "tasks:write",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({
      taskId: z.string().uuid().describe("Task id from tasks_list (include completed status to find it)."),
      inProgress: z.boolean().default(false).describe("Reopen as in progress instead of to do."),
    }),
    async run(input, ctx) {
      assertActionOk(
        await updateTask({ taskId: input.taskId, status: input.inProgress ? "in_progress" : "pending" }),
        "Could not reopen the task.",
      );
      return formatTask(await fetchTask(input.taskId), ctx.appOrigin);
    },
  }),

  defineMcpTool({
    name: "tasks_assign",
    title: "Assign a task",
    description: "Reassign a task to a teammate (ownerId from tasks_list_assignees). The new assignee gets a notification.",
    group: "tasks",
    scope: "tasks:write",
    permission: "tasks:write",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({
      taskId: z.string().uuid().describe("Task id from tasks_list."),
      ownerId: z.string().min(1).describe("User id of the new assignee."),
    }),
    async run(input, ctx) {
      assertActionOk(await updateTask({ taskId: input.taskId, ownerId: input.ownerId }), "Could not assign the task.");
      return formatTask(await fetchTask(input.taskId), ctx.appOrigin);
    },
  }),

  defineMcpTool({
    name: "tasks_delete",
    title: "Delete a task",
    description: "Delete a task (it disappears from every list; it is soft-deleted and cannot be restored from MCP). Confirm with the user first. To keep history, prefer tasks_update with status=canceled.",
    group: "tasks",
    scope: "tasks:write",
    permission: "tasks:write",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    input: z.object({ taskId: z.string().uuid().describe("Task id from tasks_list.") }),
    async run(input) {
      assertActionOk(await deleteTask(input.taskId), "Could not delete the task.");
      return { deleted: true, taskId: input.taskId };
    },
  }),

  defineMcpTool({
    name: "tasks_notifications_list",
    title: "List my notifications",
    description: "List your in-app notifications in this workspace, newest first (task assignments, mentions, approvals...). Use unreadOnly to see only what needs attention. Ids feed tasks_notifications_mark_read.",
    group: "tasks",
    scope: "tasks:read",
    permission: null,
    annotations: READ,
    input: z.object({
      unreadOnly: z.boolean().default(false).describe("Only unread notifications."),
      ...pageFields,
    }),
    async run(input, ctx) {
      const all = await listNotifications(100);
      const filtered = input.unreadOnly ? all.filter((item) => !item.read) : all;
      const page = paginateArray(filtered, input.limit, input.offset);
      return { ...page, items: page.items.map((item) => formatNotification(item, ctx.appOrigin)) };
    },
  }),

  defineMcpTool({
    name: "tasks_notifications_mark_read",
    title: "Mark notifications read",
    description: "Mark one notification read (or unread with read=false), or all of your notifications read with all=true. Only touches your own notifications.",
    group: "tasks",
    scope: "tasks:write",
    permission: null,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({
      notificationId: z.string().uuid().optional().describe("Notification id from tasks_notifications_list. Omit when all=true."),
      all: z.boolean().default(false).describe("Mark every notification read."),
      read: z.boolean().default(true).describe("true = mark read, false = mark unread (single notification only)."),
    }),
    async run(input) {
      if (input.all) {
        const result = await markAllNotificationsRead();
        assertActionOk(result, "Could not mark notifications read.");
        return { marked: "all" };
      }
      if (!input.notificationId) throw new McpToolError("Pass notificationId, or all=true.", "invalid_input");
      const result = input.read
        ? await markNotificationRead({ notificationId: input.notificationId })
        : await markNotificationUnread({ notificationId: input.notificationId });
      assertActionOk(result as { success?: boolean; error?: string }, "Could not update the notification.");
      return { marked: input.read ? "read" : "unread", notificationId: input.notificationId };
    },
  }),
];
