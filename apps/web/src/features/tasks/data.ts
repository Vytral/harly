import "server-only";

import { cache } from "react";
import { and, asc, count, desc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@harly/db";
import {
  applications,
  candidates,
  interviews,
  jobs,
  tasks,
  user as authUsers,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { can, requirePermission } from "@/features/workspaces/permissions-server";
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
    .leftJoin(
      candidates,
      and(
        eq(candidates.id, tasks.candidateId),
        eq(candidates.workspaceId, tasks.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .leftJoin(
      jobs,
      and(
        eq(jobs.id, tasks.jobId),
        eq(jobs.workspaceId, tasks.workspaceId),
        isNull(jobs.deletedAt),
      ),
    );
}

export const listTasks = cache(
  async (filters?: {
    status?: TaskStatus;
    ownerId?: string;
    priority?: string;
  }): Promise<TaskItem[]> => {
    await requirePermission("tasks:read");
    const { organization: workspace } = await getWorkspaceContext();

    const conditions = [eq(tasks.workspaceId, workspace.id), isNull(tasks.deletedAt)];

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
  await requirePermission("tasks:read");
  const { organization: workspace } = await getWorkspaceContext();

  const [row] = await baseQuery()
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.workspaceId, workspace.id),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);

  return row ? toItem(row) : null;
});

export const getTaskCounts = cache(async () => {
  await requirePermission("tasks:read");
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      status: tasks.status,
      count: count(),
    })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspace.id), isNull(tasks.deletedAt)))
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
  if (!(await can("tasks:read"))) return 0;
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
        isNull(tasks.deletedAt),
        or(eq(tasks.status, "pending"), eq(tasks.status, "in_progress")),
        and(
          isNotNull(tasks.dueDate),
          lte(tasks.dueDate, weekFromNow),
        ),
      ),
    );

  return Number(result?.count ?? 0);
});

export const listWorkspaceMembers = cache(async () => {
  await requirePermission("tasks:read");
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

export type TaskCandidateOption = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

export type TaskApplicationOption = {
  id: string;
  candidateId: string;
  jobId: string;
  candidateName: string;
  jobTitle: string;
};

export type TaskInterviewOption = {
  id: string;
  applicationId: string;
  candidateId: string;
  jobId: string;
  label: string;
  scheduledAt: string;
};

export type TaskJobOption = { id: string; title: string };

export const listTaskContextOptions = cache(async () => {
  await requirePermission("tasks:read");
  const { organization: workspace } = await getWorkspaceContext();

  const [candidateRows, applicationRows, interviewRows, jobRows] = await Promise.all([
    db
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        avatarUrl: candidates.avatarUrl,
      })
      .from(candidates)
      .where(and(eq(candidates.workspaceId, workspace.id), isNull(candidates.deletedAt)))
      .orderBy(asc(candidates.lastName), asc(candidates.firstName))
      .limit(500),
    db
      .select({
        id: applications.id,
        candidateId: applications.candidateId,
        jobId: applications.jobId,
        candidateFirst: candidates.firstName,
        candidateLast: candidates.lastName,
        jobTitle: jobs.title,
      })
      .from(applications)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, applications.candidateId),
          eq(candidates.workspaceId, workspace.id),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, workspace.id),
          isNull(jobs.deletedAt),
        ),
      )
      .where(eq(applications.workspaceId, workspace.id))
      .orderBy(desc(applications.appliedAt))
      .limit(500),
    db
      .select({
        id: interviews.id,
        applicationId: interviews.applicationId,
        candidateId: interviews.candidateId,
        jobId: interviews.jobId,
        title: interviews.title,
        type: interviews.type,
        scheduledAt: interviews.scheduledAt,
      })
      .from(interviews)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, interviews.candidateId),
          eq(candidates.workspaceId, workspace.id),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, interviews.jobId),
          eq(jobs.workspaceId, workspace.id),
          isNull(jobs.deletedAt),
        ),
      )
      .where(eq(interviews.workspaceId, workspace.id))
      .orderBy(desc(interviews.scheduledAt))
      .limit(500),
    db
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, workspace.id), isNull(jobs.deletedAt)))
      .orderBy(asc(jobs.title))
      .limit(500),
  ]);

  return {
    candidates: candidateRows,
    applications: applicationRows.map((row) => ({
      id: row.id,
      candidateId: row.candidateId,
      jobId: row.jobId,
      candidateName: `${row.candidateFirst} ${row.candidateLast}`,
      jobTitle: row.jobTitle,
    })),
    interviews: interviewRows.map((row) => ({
      id: row.id,
      applicationId: row.applicationId,
      candidateId: row.candidateId,
      jobId: row.jobId,
      label: row.title ?? `${row.type.replaceAll("_", " ")} · ${row.scheduledAt.toISOString().slice(0, 10)}`,
      scheduledAt: row.scheduledAt.toISOString(),
    })),
    jobs: jobRows,
  } satisfies {
    candidates: TaskCandidateOption[];
    applications: TaskApplicationOption[];
    interviews: TaskInterviewOption[];
    jobs: TaskJobOption[];
  };
});
