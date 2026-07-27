import "server-only";

import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import { ApiError, type Cursor } from "@harly/api";
import {
  applications,
  activityEvents,
  candidates,
  db,
  interviews,
  jobs,
  member,
  tasks,
  type Task,
} from "@harly/db";
import {
  persistDomainEvent,
  publishPersistedDomainEvents,
  type PersistedDomainEvent,
} from "@/server/events/emit";

/**
 * Workspace-scoped task service for the REST API.  It deliberately accepts an
 * explicit workspace and actor instead of consulting session state, so an API
 * key can safely use the same domain logic as interactive product flows.
 */

export type TaskStatus = "pending" | "in_progress" | "completed" | "canceled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskApiInput = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  ownerId: string;
  candidateId?: string | null;
  applicationId?: string | null;
  jobId?: string | null;
  interviewId?: string | null;
};

export type TaskApiUpdateInput = Partial<TaskApiInput>;

export type TaskLinks = Pick<
  Task,
  "candidateId" | "applicationId" | "jobId" | "interviewId"
>;

export function serializeTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    ownerId: task.ownerId,
    candidateId: task.candidateId,
    applicationId: task.applicationId,
    jobId: task.jobId,
    interviewId: task.interviewId,
    createdById: task.createdById,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function cursorWhere(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const createdAt = new Date(cursor.createdAt);
  return or(
    lt(tasks.createdAt, createdAt),
    and(eq(tasks.createdAt, createdAt), lt(tasks.id, cursor.id)),
  );
}

export async function listTasksForApi(input: {
  workspaceId: string;
  cursor: Cursor | null;
  limit: number;
  ownerId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  candidateId?: string;
  applicationId?: string;
  jobId?: string;
  interviewId?: string;
}): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, input.workspaceId),
        isNull(tasks.deletedAt),
        input.ownerId ? eq(tasks.ownerId, input.ownerId) : undefined,
        input.status ? eq(tasks.status, input.status) : undefined,
        input.priority ? eq(tasks.priority, input.priority) : undefined,
        input.candidateId ? eq(tasks.candidateId, input.candidateId) : undefined,
        input.applicationId
          ? eq(tasks.applicationId, input.applicationId)
          : undefined,
        input.jobId ? eq(tasks.jobId, input.jobId) : undefined,
        input.interviewId ? eq(tasks.interviewId, input.interviewId) : undefined,
        cursorWhere(input.cursor),
      ),
    )
    .orderBy(desc(tasks.createdAt), desc(tasks.id))
    .limit(input.limit + 1);
}

export async function getTaskForApi(input: {
  workspaceId: string;
  taskId: string;
}): Promise<Task> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, input.taskId),
        eq(tasks.workspaceId, input.workspaceId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);

  if (!task) throw ApiError.notFound("Task not found.");
  return task;
}

export async function assertWorkspaceMember(input: {
  workspaceId: string;
  userId: string;
  label: "Actor" | "Task owner";
}): Promise<void> {
  const [membership] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(
        eq(member.organizationId, input.workspaceId),
        eq(member.userId, input.userId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw ApiError.unprocessable(
      `${input.label} must be a member of this workspace.`,
    );
  }
}

/**
 * Verify every linked record belongs to this workspace, then verify the links
 * describe one coherent candidate/application/job/interview tuple.  Foreign
 * keys alone cannot provide either guarantee because they are global ids.
 */
export async function assertTaskLinks(
  workspaceId: string,
  links: TaskLinks,
): Promise<void> {
  const [candidate, application, job, interview] = await Promise.all([
    links.candidateId
      ? db
          .select({ id: candidates.id })
          .from(candidates)
          .where(
            and(
              eq(candidates.id, links.candidateId),
              eq(candidates.workspaceId, workspaceId),
              isNull(candidates.deletedAt),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    links.applicationId
      ? db
          .select({ id: applications.id, candidateId: applications.candidateId, jobId: applications.jobId })
          .from(applications)
          .where(
            and(
              eq(applications.id, links.applicationId),
              eq(applications.workspaceId, workspaceId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    links.jobId
      ? db
          .select({ id: jobs.id })
          .from(jobs)
          .where(
            and(
              eq(jobs.id, links.jobId),
              eq(jobs.workspaceId, workspaceId),
              isNull(jobs.deletedAt),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    links.interviewId
      ? db
          .select({
            id: interviews.id,
            candidateId: interviews.candidateId,
            applicationId: interviews.applicationId,
            jobId: interviews.jobId,
          })
          .from(interviews)
          .where(
            and(
              eq(interviews.id, links.interviewId),
              eq(interviews.workspaceId, workspaceId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);

  if (links.candidateId && !candidate[0]) {
    throw ApiError.unprocessable("Candidate does not belong to this workspace.");
  }
  if (links.applicationId && !application[0]) {
    throw ApiError.unprocessable("Application does not belong to this workspace.");
  }
  if (links.jobId && !job[0]) {
    throw ApiError.unprocessable("Job does not belong to this workspace.");
  }
  if (links.interviewId && !interview[0]) {
    throw ApiError.unprocessable("Interview does not belong to this workspace.");
  }

  const applicationLink = application[0];
  const interviewLink = interview[0];
  if (
    applicationLink &&
    ((links.candidateId && applicationLink.candidateId !== links.candidateId) ||
      (links.jobId && applicationLink.jobId !== links.jobId))
  ) {
    throw ApiError.unprocessable(
      "Application must match the linked candidate and job.",
    );
  }
  if (
    interviewLink &&
    ((links.candidateId && interviewLink.candidateId !== links.candidateId) ||
      (links.applicationId && interviewLink.applicationId !== links.applicationId) ||
      (links.jobId && interviewLink.jobId !== links.jobId))
  ) {
    throw ApiError.unprocessable(
      "Interview must match the linked candidate, application, and job.",
    );
  }
}

/**
 * Shared integrity guard for every task write path. Foreign keys protect
 * global existence, but not tenant membership, so the UI and REST API must
 * use the same workspace checks.
 */
export async function assertTaskReferences(input: {
  workspaceId: string;
  ownerId: string;
  links: TaskLinks;
}): Promise<void> {
  await Promise.all([
    assertWorkspaceMember({
      workspaceId: input.workspaceId,
      userId: input.ownerId,
      label: "Task owner",
    }),
    assertTaskLinks(input.workspaceId, input.links),
  ]);
}

export async function createTaskForApi(input: {
  workspaceId: string;
  actorId: string;
  values: TaskApiInput;
}): Promise<Task> {
  await Promise.all([
    assertWorkspaceMember({
      workspaceId: input.workspaceId,
      userId: input.actorId,
      label: "Actor",
    }),
    assertTaskReferences({
      workspaceId: input.workspaceId,
      ownerId: input.values.ownerId,
      links: {
        candidateId: input.values.candidateId ?? null,
        applicationId: input.values.applicationId ?? null,
        jobId: input.values.jobId ?? null,
        interviewId: input.values.interviewId ?? null,
      },
    }),
  ]);

  const status = input.values.status ?? "pending";
  let domainEvent: PersistedDomainEvent | undefined;
  const task = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(tasks)
      .values({
        workspaceId: input.workspaceId,
        title: input.values.title,
        description: input.values.description ?? null,
        status,
        priority: input.values.priority ?? "medium",
        dueDate: input.values.dueDate ?? null,
        completedAt: status === "completed" ? new Date() : null,
        ownerId: input.values.ownerId,
        candidateId: input.values.candidateId ?? null,
        applicationId: input.values.applicationId ?? null,
        jobId: input.values.jobId ?? null,
        interviewId: input.values.interviewId ?? null,
        createdById: input.actorId,
      })
      .returning();

    if (!created) throw ApiError.internal("Task could not be created.");
    await tx.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      entityType: "task",
      entityId: created.id,
      type: "task.created",
      metadata: { taskId: created.id, status },
    });
    domainEvent = await persistDomainEvent(tx, {
      name: "task.created",
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      aggregateType: "task",
      aggregateId: created.id,
      payload: { task: serializeTask(created) },
    });
    return created;
  });
  if (domainEvent) await publishPersistedDomainEvents([domainEvent]);

  return task;
}

export async function updateTaskForApi(input: {
  workspaceId: string;
  actorId: string;
  taskId: string;
  values: TaskApiUpdateInput;
}): Promise<Task> {
  const existing = await getTaskForApi({
    workspaceId: input.workspaceId,
    taskId: input.taskId,
  });

  const ownerId = input.values.ownerId ?? existing.ownerId;
  const links: TaskLinks = {
    candidateId:
      input.values.candidateId === undefined
        ? existing.candidateId
        : input.values.candidateId,
    applicationId:
      input.values.applicationId === undefined
        ? existing.applicationId
        : input.values.applicationId,
    jobId: input.values.jobId === undefined ? existing.jobId : input.values.jobId,
    interviewId:
      input.values.interviewId === undefined
        ? existing.interviewId
        : input.values.interviewId,
  };

  await Promise.all([
    assertWorkspaceMember({
      workspaceId: input.workspaceId,
      userId: input.actorId,
      label: "Actor",
    }),
    assertTaskReferences({
      workspaceId: input.workspaceId,
      ownerId,
      links,
    }),
  ]);

  const set: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (input.values.title !== undefined) set.title = input.values.title;
  if (input.values.description !== undefined) {
    set.description = input.values.description;
  }
  if (input.values.priority !== undefined) set.priority = input.values.priority;
  if (input.values.dueDate !== undefined) set.dueDate = input.values.dueDate;
  if (input.values.ownerId !== undefined) set.ownerId = input.values.ownerId;
  if (input.values.candidateId !== undefined) set.candidateId = input.values.candidateId;
  if (input.values.applicationId !== undefined) {
    set.applicationId = input.values.applicationId;
  }
  if (input.values.jobId !== undefined) set.jobId = input.values.jobId;
  if (input.values.interviewId !== undefined) set.interviewId = input.values.interviewId;
  if (input.values.status !== undefined) {
    set.status = input.values.status;
    set.completedAt = input.values.status === "completed" ? new Date() : null;
  }

  let domainEvent: PersistedDomainEvent | undefined;
  const task = await db.transaction(async (tx) => {
    const [task] = await tx
      .update(tasks)
      .set(set)
      .where(
        and(
          eq(tasks.id, input.taskId),
          eq(tasks.workspaceId, input.workspaceId),
          isNull(tasks.deletedAt),
        ),
      )
      .returning();

    if (!task) throw ApiError.notFound("Task not found.");
    await tx.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      entityType: "task",
      entityId: task.id,
      type: input.values.status === "completed" ? "task.completed" : "task.updated",
      metadata: { taskId: task.id, status: input.values.status ?? null },
    });
    domainEvent = await persistDomainEvent(tx, {
      name: input.values.status === "completed" ? "task.updated" : "task.updated",
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      aggregateType: "task",
      aggregateId: task.id,
      payload: { task: serializeTask(task) },
    });
    return task;
  });
  if (domainEvent) await publishPersistedDomainEvents([domainEvent]);
  return task;
}

export async function deleteTaskForApi(input: {
  workspaceId: string;
  actorId: string;
  taskId: string;
}): Promise<void> {
  await assertWorkspaceMember({
    workspaceId: input.workspaceId,
    userId: input.actorId,
    label: "Actor",
  });
  await getTaskForApi({
    workspaceId: input.workspaceId,
    taskId: input.taskId,
  });

  let domainEvent: PersistedDomainEvent | undefined;
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(tasks.id, input.taskId),
          eq(tasks.workspaceId, input.workspaceId),
          isNull(tasks.deletedAt),
        ),
      )
      .returning({ id: tasks.id });

    if (!deleted) throw ApiError.notFound("Task not found.");
    await tx.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      entityType: "task",
      entityId: deleted.id,
      type: "task.deleted",
      metadata: { taskId: deleted.id },
    });
    domainEvent = await persistDomainEvent(tx, {
      name: "task.deleted",
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      aggregateType: "task",
      aggregateId: deleted.id,
      payload: { task: { id: deleted.id } },
    });
  });
  if (domainEvent) await publishPersistedDomainEvents([domainEvent]);
}
