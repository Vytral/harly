"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db, notifications } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";

const idSchema = z.object({ notificationId: z.uuid() });

/** Mark one of the current user's notifications as read. */
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

  revalidatePath("/dashboard/inbox");
  return { success: true };
}

/** Mark all of the current user's notifications in this workspace as read. */
export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
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

  revalidatePath("/dashboard/inbox");
  return { success: true };
}
