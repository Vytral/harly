"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { z } from "zod";

import { db, notifications } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";

const idSchema = z.object({ notificationId: z.uuid() });
const idsSchema = z.object({
  notificationIds: z.array(z.uuid()).min(1).max(100),
});

function revalidateNotifications() {
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard", "layout");
}

/** Mark one notification as read. */
export async function markNotificationRead(input: {
  notificationId: string;
}): Promise<{ success: boolean }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { success: false };

  const { organization: workspace, user } = await getWorkspaceContext();

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, parsed.data.notificationId),
        eq(notifications.workspaceId, workspace.id),
        eq(notifications.userId, user.id),
      ),
    );

  revalidateNotifications();
  return { success: true };
}

/** Mark one notification as unread. */
export async function markNotificationUnread(input: {
  notificationId: string;
}): Promise<{ success: boolean }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { success: false };

  const { organization: workspace, user } = await getWorkspaceContext();

  await db
    .update(notifications)
    .set({ readAt: null })
    .where(
      and(
        eq(notifications.id, parsed.data.notificationId),
        eq(notifications.workspaceId, workspace.id),
        eq(notifications.userId, user.id),
      ),
    );

  revalidateNotifications();
  return { success: true };
}

/** Mark all unread notifications as read. */
export async function markAllNotificationsRead(): Promise<{
  success: boolean;
}> {
  const { organization: workspace, user } = await getWorkspaceContext();

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.workspaceId, workspace.id),
        eq(notifications.userId, user.id),
        isNull(notifications.readAt),
      ),
    );

  revalidateNotifications();
  return { success: true };
}

/** Delete a single notification. */
export async function deleteNotification(input: {
  notificationId: string;
}): Promise<{ success: boolean }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { success: false };

  const { organization: workspace, user } = await getWorkspaceContext();

  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.id, parsed.data.notificationId),
        eq(notifications.workspaceId, workspace.id),
        eq(notifications.userId, user.id),
      ),
    );

  revalidateNotifications();
  return { success: true };
}

/** Delete multiple notifications. */
export async function deleteNotifications(input: {
  notificationIds: string[];
}): Promise<{ success: boolean }> {
  const parsed = idsSchema.safeParse(input);
  if (!parsed.success) return { success: false };

  const { organization: workspace, user } = await getWorkspaceContext();

  await db
    .delete(notifications)
    .where(
      and(
        inArray(notifications.id, parsed.data.notificationIds),
        eq(notifications.workspaceId, workspace.id),
        eq(notifications.userId, user.id),
      ),
    );

  revalidateNotifications();
  return { success: true };
}

/** Delete every notification belonging to the current user in this workspace. */
export async function deleteAllNotifications(): Promise<{ success: boolean }> {
  const { organization: workspace, user } = await getWorkspaceContext();

  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.workspaceId, workspace.id),
        eq(notifications.userId, user.id),
      ),
    );

  revalidateNotifications();
  return { success: true };
}
