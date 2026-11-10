import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db, notifications, user as authUsers } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { getTranslations } from "@/i18n/server";

import { localizeNotification } from "./copy";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  actorName: string | null;
  actorAvatar: string | null;
  read: boolean;
  createdAt: string;
};

/** Current user's notifications in the active workspace, newest first. */
export async function listNotifications(limit = 50): Promise<NotificationItem[]> {
  const { organization: workspace, user } = await getWorkspaceContext();

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      metadata: notifications.metadata,
      href: notifications.href,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorName: authUsers.name,
      actorAvatar: authUsers.image,
    })
    .from(notifications)
    .leftJoin(authUsers, eq(authUsers.id, notifications.actorId))
    .where(
      and(
        eq(notifications.workspaceId, workspace.id),
        eq(notifications.userId, user.id),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const t = await getTranslations("labels.notifications");
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    ...localizeNotification(row, t),
    href: row.href,
    actorName: row.actorName,
    actorAvatar: row.actorAvatar,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { organization: workspace, user } = await getWorkspaceContext();

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, workspace.id),
        eq(notifications.userId, user.id),
        isNull(notifications.readAt),
      ),
    );
  return row?.count ?? 0;
}
