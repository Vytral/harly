"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@harly/db";
import { activityEvents, notifications, tasks } from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";

const log = createLogger("tasks");

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["pending", "in_progress", "completed", "canceled"]).default("pending"),
  dueDate: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? new Date(v) : null)),
  ownerId: z.string().min(1, "Assignee is required."),
  candidateId: z.string().uuid().optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  interviewId: z.string().uuid().optional().nullable(),
});

export type CreateTaskInput = z.input<typeof createSchema>;

export async function createTask(
  input: CreateTaskInput,
): Promise<{ success: boolean; error?: string; taskId?: string }> {
  try {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message };
    }

    const { organization: workspace, user } = await requirePermission("collab:write");
    const data = parsed.data;

    const [task] = await db
      .insert(tasks)
      .values({
        workspaceId: workspace.id,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        status: data.status,
        completedAt: data.status === "completed" ? new Date() : null,
        dueDate: data.dueDate,
        ownerId: data.ownerId,
        candidateId: data.candidateId ?? null,
        applicationId: data.applicationId ?? null,
        jobId: data.jobId ?? null,
        interviewId: data.interviewId ?? null,
        createdById: user.id,
      })
      .returning({ id: tasks.id });

    if (!task) return { success: false, error: "Failed to create task." };

    await db.insert(activityEvents).values({
      workspaceId: workspace.id,
      actorId: user.id,
      entityType: "application",
      entityId: task.id,
      type: "task.created",
      metadata: { title: data.title, priority: data.priority },
    });

    if (data.ownerId !== user.id) {
      await db.insert(notifications).values({
        workspaceId: workspace.id,
        userId: data.ownerId,
        actorId: user.id,
        type: "task.assigned",
        title: `New task: ${data.title}`,
        body: `${user.name} assigned you a task.`,
        href: "/dashboard/tasks",
      });
    }

    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard");
    return { success: true, taskId: task.id };
  } catch (error) {
    log.error(error, "createTask failed");
    return { success: false, error: "Unable to create task." };
  }
}

const updateSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["pending", "in_progress", "completed", "canceled"]).optional(),
  // Absent → undefined (leave the column untouched). Explicit null/"" → clear it.
  // The previous transform collapsed an absent value to null, so every
  // status-only update (e.g. a kanban drag) silently wiped the due date.
  dueDate: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? new Date(v) : null)),
  ownerId: z.string().optional(),
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

    const { organization: workspace, user } = await requirePermission("collab:write");
    const { taskId, ...fields } = parsed.data;

    const set: Record<string, unknown> = {};
    if (fields.title !== undefined) set.title = fields.title;
    if (fields.description !== undefined) set.description = fields.description;
    if (fields.priority !== undefined) set.priority = fields.priority;
    if (fields.dueDate !== undefined) set.dueDate = fields.dueDate;
    if (fields.ownerId !== undefined) set.ownerId = fields.ownerId;

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

    const updated = await db
      .update(tasks)
      .set(set)
      .where(
        and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspace.id)),
      )
      .returning({ id: tasks.id, ownerId: tasks.ownerId });

    if (updated.length === 0) {
      return { success: false, error: "Task not found." };
    }

    if (fields.ownerId && fields.ownerId !== user.id) {
      await db.insert(notifications).values({
        workspaceId: workspace.id,
        userId: fields.ownerId,
        actorId: user.id,
        type: "task.assigned",
        title: "Task reassigned to you",
        body: `${user.name} assigned you a task.`,
        href: "/dashboard/tasks",
      });
    }

    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    log.error(error, "updateTask failed");
    return { success: false, error: "Unable to update task." };
  }
}

export async function deleteTask(
  taskId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { organization: workspace } = await requirePermission("collab:write");

    const deleted = await db
      .delete(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspace.id)))
      .returning({ id: tasks.id });

    if (deleted.length === 0) {
      return { success: false, error: "Task not found." };
    }

    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    log.error(error, "deleteTask failed");
    return { success: false, error: "Unable to delete task." };
  }
}
