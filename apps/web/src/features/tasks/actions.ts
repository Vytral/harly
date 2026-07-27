"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { ApiError } from "@harly/api";
import { db } from "@harly/db";
import { activityEvents, notifications, tasks } from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-log";
import { assertTaskReferences } from "./service";
import { emitRealtimeInvalidation } from "@/server/events/emit";
import {
  persistDomainEvent,
  publishPersistedDomainEvents,
  type PersistedDomainEvent,
} from "@/server/events/emit";
import { REALTIME_EVENTS } from "@/server/events/registry";

const log = createLogger("tasks");

const taskDateInput = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid due date." });
      return z.NEVER;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      ctx.addIssue({ code: "custom", message: "Enter a valid due date." });
      return z.NEVER;
    }
    return date;
  });

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z
    .enum(["pending", "in_progress", "completed", "canceled"])
    .default("pending"),
  dueDate: taskDateInput,
  ownerId: z.string().min(1, "Assignee is required."),
  candidateId: z.string().uuid().optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  interviewId: z.string().uuid().optional().nullable(),
});

export type CreateTaskInput = z.input<typeof createSchema>;

export async function createTask(input: CreateTaskInput): Promise<{
  success: boolean;
  error?: string;
  taskId?: string;
  updatedAt?: string;
}> {
  try {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message };
    }

    const { organization: workspace, user } =
      await requirePermission("tasks:write");
    const data = parsed.data;

    await assertTaskReferences({
      workspaceId: workspace.id,
      ownerId: data.ownerId,
      links: {
        candidateId: data.candidateId ?? null,
        applicationId: data.applicationId ?? null,
        jobId: data.jobId ?? null,
        interviewId: data.interviewId ?? null,
      },
    });

    let domainEvent: PersistedDomainEvent | undefined;
    const task = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(tasks)
        .values({
          workspaceId: workspace.id,
          title: data.title,
          description: data.description ?? null,
          priority: data.priority,
          status: data.status,
          completedAt: data.status === "completed" ? new Date() : null,
          dueDate: data.dueDate ?? null,
          ownerId: data.ownerId,
          candidateId: data.candidateId ?? null,
          applicationId: data.applicationId ?? null,
          jobId: data.jobId ?? null,
          interviewId: data.interviewId ?? null,
          createdById: user.id,
        })
        .returning({
          id: tasks.id,
          // Keep PostgreSQL's microsecond precision in the undo version. A JS
          // Date would truncate it and make a freshly-created task look stale.
          updatedAt: sql<string>`to_char(${tasks.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        });

      if (!created) throw new Error("Failed to create task.");

      await tx.insert(activityEvents).values({
        workspaceId: workspace.id,
        actorId: user.id,
        entityType: "task",
        entityId: created.id,
        type: "task.created",
        metadata: { taskId: created.id, status: data.status },
      });

      if (data.ownerId !== user.id) {
        await tx.insert(notifications).values({
          workspaceId: workspace.id,
          userId: data.ownerId,
          actorId: user.id,
          type: "task.assigned",
          title: `New task: ${data.title}`,
          body: `${user.name} assigned you a task.`,
          href: "/dashboard/tasks",
        });
      }

      domainEvent = await persistDomainEvent(tx, {
        name: "task.created",
        workspaceId: workspace.id,
        actorId: user.id,
        aggregateType: "task",
        aggregateId: created.id,
        payload: { task: { id: created.id, status: data.status } },
      });

      return created;
    });

    if (domainEvent) await publishPersistedDomainEvents([domainEvent]);

    await logAuditEvent({
      workspaceId: workspace.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "task.created",
      resourceType: "task",
      resourceId: task.id,
      metadata: { status: data.status, priority: data.priority },
    });

    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard");
    void emitRealtimeInvalidation({
      eventName: REALTIME_EVENTS.DASHBOARD_INVALIDATE,
      workspaceId: workspace.id,
      payload: { area: "tasks", taskId: task.id },
    }).catch(() => undefined);
    return {
      success: true,
      taskId: task.id,
      updatedAt: task.updatedAt,
    };
  } catch (error) {
    log.error(error, "createTask failed");
    return {
      success: false,
      error:
        error instanceof ApiError ? error.message : "Unable to create task.",
    };
  }
}

const updateSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z
    .enum(["pending", "in_progress", "completed", "canceled"])
    .optional(),
  // Absent → undefined (leave the column untouched). Explicit null/"" → clear it.
  // The previous transform collapsed an absent value to null, so every
  // status-only update (e.g. a kanban drag) silently wiped the due date.
  dueDate: taskDateInput,
  ownerId: z.string().optional(),
  candidateId: z.string().uuid().optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  interviewId: z.string().uuid().optional().nullable(),
});

export type UpdateTaskInput = z.input<typeof updateSchema>;

export async function updateTask(
  input: UpdateTaskInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message };
    }

    const { organization: workspace, user } =
      await requirePermission("tasks:write");
    const { taskId, ...fields } = parsed.data;

    const [existing] = await db
      .select({
        ownerId: tasks.ownerId,
        candidateId: tasks.candidateId,
        applicationId: tasks.applicationId,
        jobId: tasks.jobId,
        interviewId: tasks.interviewId,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.workspaceId, workspace.id),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) return { success: false, error: "Task not found." };

    const ownerId = fields.ownerId ?? existing.ownerId;
    const links = {
      candidateId:
        fields.candidateId === undefined
          ? existing.candidateId
          : fields.candidateId,
      applicationId:
        fields.applicationId === undefined
          ? existing.applicationId
          : fields.applicationId,
      jobId: fields.jobId === undefined ? existing.jobId : fields.jobId,
      interviewId:
        fields.interviewId === undefined
          ? existing.interviewId
          : fields.interviewId,
    };

    await assertTaskReferences({
      workspaceId: workspace.id,
      ownerId,
      links,
    });

    const set: Record<string, unknown> = {};
    if (fields.title !== undefined) set.title = fields.title;
    if (fields.description !== undefined) set.description = fields.description;
    if (fields.priority !== undefined) set.priority = fields.priority;
    if (fields.dueDate !== undefined) set.dueDate = fields.dueDate;
    if (fields.ownerId !== undefined) set.ownerId = fields.ownerId;
    if (fields.candidateId !== undefined) set.candidateId = fields.candidateId;
    if (fields.applicationId !== undefined)
      set.applicationId = fields.applicationId;
    if (fields.jobId !== undefined) set.jobId = fields.jobId;
    if (fields.interviewId !== undefined) set.interviewId = fields.interviewId;

    if (fields.status !== undefined) {
      set.status = fields.status;
      if (fields.status === "completed") {
        set.completedAt = new Date();
      } else {
        set.completedAt = null;
      }
    }

    if (Object.keys(set).length === 0) {
      return { success: true };
    }

    let domainEvent: PersistedDomainEvent | undefined;
    const updated = await db.transaction(async (tx) => {
      const [task] = await tx
        .update(tasks)
        .set(set)
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.workspaceId, workspace.id),
            isNull(tasks.deletedAt),
          ),
        )
        .returning({ id: tasks.id, ownerId: tasks.ownerId });

      if (!task) throw ApiError.notFound("Task not found.");

      await tx.insert(activityEvents).values({
        workspaceId: workspace.id,
        actorId: user.id,
        entityType: "task",
        entityId: task.id,
        type: fields.status === "completed" ? "task.completed" : "task.updated",
        metadata: {
          taskId: task.id,
          status: fields.status ?? null,
        },
      });

      if (fields.ownerId && fields.ownerId !== user.id) {
        await tx.insert(notifications).values({
          workspaceId: workspace.id,
          userId: fields.ownerId,
          actorId: user.id,
          type: "task.assigned",
          title: "Task reassigned to you",
          body: `${user.name} assigned you a task.`,
          href: "/dashboard/tasks",
        });
      }

      domainEvent = await persistDomainEvent(tx, {
        name: "task.updated",
        workspaceId: workspace.id,
        actorId: user.id,
        aggregateType: "task",
        aggregateId: task.id,
        payload: { task: { id: task.id, status: fields.status ?? null } },
      });

      return task;
    });

    if (domainEvent) await publishPersistedDomainEvents([domainEvent]);

    await logAuditEvent({
      workspaceId: workspace.id,
      actorId: user.id,
      actorEmail: user.email,
      action: fields.status === "completed" ? "task.completed" : "task.updated",
      resourceType: "task",
      resourceId: updated.id,
      metadata: { status: fields.status ?? null },
    });

    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard");
    void emitRealtimeInvalidation({
      eventName: REALTIME_EVENTS.DASHBOARD_INVALIDATE,
      workspaceId: workspace.id,
      payload: { area: "tasks", taskId: updated.id },
    }).catch(() => undefined);
    return { success: true };
  } catch (error) {
    log.error(error, "updateTask failed");
    return {
      success: false,
      error:
        error instanceof ApiError ? error.message : "Unable to update task.",
    };
  }
}

/**
 * Complete every open task owned by the signed-in user in one SQL statement.
 *
 * This deliberately does not accept task ids: callers cannot accidentally
 * complete a teammate's task, and the update cannot be partially applied when
 * a task list is paginated or changes between the AI preview and confirmation.
 */
export async function completeMyOpenTasks(): Promise<{
  success: boolean;
  error?: string;
  updatedCount?: number;
}> {
  try {
    const { organization: workspace, user } =
      await requirePermission("tasks:write");

    const domainEvents: PersistedDomainEvent[] = [];
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(tasks)
        .set({ status: "completed", completedAt: new Date() })
        .where(
          and(
            eq(tasks.workspaceId, workspace.id),
            eq(tasks.ownerId, user.id),
            isNull(tasks.deletedAt),
            or(eq(tasks.status, "pending"), eq(tasks.status, "in_progress")),
          ),
        )
        .returning({ id: tasks.id });

      for (const row of rows) {
        await tx.insert(activityEvents).values({
          workspaceId: workspace.id,
          actorId: user.id,
          entityType: "task",
          entityId: row.id,
          type: "task.completed",
          metadata: { taskId: row.id },
        });
        domainEvents.push(
          await persistDomainEvent(tx, {
            name: "task.updated",
            workspaceId: workspace.id,
            actorId: user.id,
            aggregateType: "task",
            aggregateId: row.id,
            payload: { task: { id: row.id, status: "completed" } },
          }),
        );
      }
      return rows;
    });

    await publishPersistedDomainEvents(domainEvents);

    if (updated.length > 0) {
      await logAuditEvent({
        workspaceId: workspace.id,
        actorId: user.id,
        actorEmail: user.email,
        action: "task.bulk_completed",
        resourceType: "task",
        metadata: { count: updated.length },
      });
    }

    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard");
    if (updated.length > 0) {
      void emitRealtimeInvalidation({
        eventName: REALTIME_EVENTS.DASHBOARD_INVALIDATE,
        workspaceId: workspace.id,
        payload: { area: "tasks", count: updated.length },
      }).catch(() => undefined);
    }
    return { success: true, updatedCount: updated.length };
  } catch (error) {
    log.error(error, "completeMyOpenTasks failed");
    return { success: false, error: "Unable to complete your tasks." };
  }
}

export async function deleteTask(
  taskId: string,
  expectedUpdatedAt?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { organization: workspace, user } =
      await requirePermission("tasks:write");

    let domainEvent: PersistedDomainEvent | undefined;
    const deleted = await db.transaction(async (tx) => {
      const rows = await tx
        .update(tasks)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.workspaceId, workspace.id),
            isNull(tasks.deletedAt),
            expectedUpdatedAt
              ? sql`${tasks.updatedAt} = ${expectedUpdatedAt}::timestamptz`
              : undefined,
          ),
        )
        .returning({ id: tasks.id });

      if (rows[0]) {
        await tx.insert(activityEvents).values({
          workspaceId: workspace.id,
          actorId: user.id,
          entityType: "task",
          entityId: rows[0].id,
          type: "task.deleted",
          metadata: { taskId: rows[0].id },
        });
        domainEvent = await persistDomainEvent(tx, {
          name: "task.deleted",
          workspaceId: workspace.id,
          actorId: user.id,
          aggregateType: "task",
          aggregateId: rows[0].id,
          payload: { task: { id: rows[0].id } },
        });
      }
      return rows;
    });

    if (domainEvent) await publishPersistedDomainEvents([domainEvent]);

    if (deleted.length === 0) {
      return {
        success: false,
        error: expectedUpdatedAt
          ? "This task changed after the original action and was not undone."
          : "Task not found.",
      };
    }

    await logAuditEvent({
      workspaceId: workspace.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "task.deleted",
      resourceType: "task",
      resourceId: deleted[0].id,
      severity: "warning",
    });

    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard");
    void emitRealtimeInvalidation({
      eventName: REALTIME_EVENTS.DASHBOARD_INVALIDATE,
      workspaceId: workspace.id,
      payload: { area: "tasks", taskId: deleted[0].id },
    }).catch(() => undefined);
    return { success: true };
  } catch (error) {
    log.error(error, "deleteTask failed");
    return { success: false, error: "Unable to delete task." };
  }
}
