import "server-only";

import { cache } from "react";
import { and, asc, count, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@harly/db";
import {
  candidates,
  jobs,
  tasks,
  user as authUsers,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import type { TaskItem, TaskStatus } from "./shared";

function toItem(row: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  completedAt: Date | null;
  ownerId: string;
  ownerName: string | null;
  ownerImage: string | null;
  candidateId: string | null;
  candidateFirst: string | null;
  candidateLast: string | null;
  applicationId: string | null;
  jobId: string | null;
  jobTitle: string | null;
  interviewId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}): TaskItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TaskItem["status"],
    priority: row.priority as TaskItem["priority"],
    dueDate: row.dueDate?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    ownerId: row.ownerId,
    ownerName: row.ownerName ?? "Unknown",
    ownerImage: row.ownerImage ?? null,
    candidateId: row.candidateId,
    candidateName:
      row.candidateFirst && row.candidateLast
        ? `${row.candidateFirst} ${row.candidateLast}`
        : null,
    applicationId: row.applicationId,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    interviewId: row.interviewId,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const baseSelect = () => ({
  id: tasks.id,
  title: tasks.title,
  description: tasks.description,
  status: tasks.status,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  completedAt: tasks.completedAt,
  ownerId: tasks.ownerId,
  ownerName: authUsers.name,
  ownerImage: authUsers.image,
  candidateId: tasks.candidateId,
  candidateFirst: candidates.firstName,
  candidateLast: candidates.lastName,
  applicationId: tasks.applicationId,
  jobId: tasks.jobId,
  jobTitle: jobs.title,
  interviewId: tasks.interviewId,
  createdById: tasks.createdById,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
});

function baseQuery() {
  return db
    .select(baseSelect())
    .from(tasks)
    .innerJoin(authUsers, eq(authUsers.id, tasks.ownerId))
    .leftJoin(candidates, eq(candidates.id, tasks.candidateId))
    .leftJoin(jobs, eq(jobs.id, tasks.jobId));
}

export const listTasks = cache(
  async (filters?: {
    status?: TaskStatus;
    ownerId?: string;
    priority?: string;
  }): Promise<TaskItem[]> => {
    const { organization: workspace } = await getWorkspaceContext();

    const conditions = [eq(tasks.workspaceId, workspace.id)];

    // All statuses (incl. canceled) so the board can show the full lifecycle.
    if (filters?.status) {
      conditions.push(eq(tasks.status, filters.status));
    }

    if (filters?.ownerId) {
      conditions.push(eq(tasks.ownerId, filters.ownerId));
    }

    if (filters?.priority) {
      conditions.push(
        eq(tasks.priority, filters.priority as TaskItem["priority"]),
      );
    }

    const rows = await baseQuery()
      .where(and(...conditions))
      .orderBy(
        asc(
          sql`CASE ${tasks.priority}
            WHEN 'urgent' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
          END`,
        ),
        asc(tasks.dueDate),
        desc(tasks.createdAt),
      );

    return rows.map(toItem);
  },
);

export const getTask = cache(async (taskId: string): Promise<TaskItem | null> => {
  const { organization: workspace } = await getWorkspaceContext();

  const [row] = await baseQuery()
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspace.id)))
    .limit(1);

  return row ? toItem(row) : null;
});

export const getTaskCounts = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      status: tasks.status,
      count: count(),
    })
    .from(tasks)
    .where(eq(tasks.workspaceId, workspace.id))
    .groupBy(tasks.status);

  const counts: Record<string, number> = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    canceled: 0,
  };

  for (const row of rows) {
    counts[row.status] = Number(row.count);
  }

  return counts;
});

export const getMyTasksDueCount = cache(async () => {
  const { organization: workspace, user } = await getWorkspaceContext();
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86_400_000);

  const [result] = await db
    .select({ count: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspace.id),
        eq(tasks.ownerId, user.id),
        or(eq(tasks.status, "pending"), eq(tasks.status, "in_progress")),
        or(
          isNull(tasks.dueDate),
          lt(tasks.dueDate, weekFromNow),
        ),
      ),
    );

  return Number(result?.count ?? 0);
});

export const listWorkspaceMembers = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();

  const { member } = await import("@harly/db");

  const rows = await db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      image: authUsers.image,
    })
    .from(member)
    .innerJoin(authUsers, eq(authUsers.id, member.userId))
    .where(eq(member.organizationId, workspace.id))
    .orderBy(asc(authUsers.name));

  return rows;
});
