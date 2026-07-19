"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { candidatePortalNotifications, db } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";

const idSchema = z.object({ notificationId: z.uuid() });

async function getCandidatePortalSession() {
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  return token ? resolvePortalSession(token) : null;
}

function revalidatePortalNotifications() {
  revalidatePath("/portal/notifications");
  revalidatePath("/portal", "layout");
}

export async function markCandidatePortalNotificationRead(input: {
  notificationId: string;
}): Promise<{ success: boolean }> {
  const parsed = idSchema.safeParse(input);
  const session = await getCandidatePortalSession();
  if (!parsed.success || !session) return { success: false };

  await db
    .update(candidatePortalNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(candidatePortalNotifications.id, parsed.data.notificationId),
        eq(candidatePortalNotifications.workspaceId, session.workspaceId),
        eq(candidatePortalNotifications.candidateId, session.candidateId),
      ),
    );

  revalidatePortalNotifications();
  return { success: true };
}

export async function markCandidatePortalNotificationUnread(input: {
  notificationId: string;
}): Promise<{ success: boolean }> {
  const parsed = idSchema.safeParse(input);
  const session = await getCandidatePortalSession();
  if (!parsed.success || !session) return { success: false };

  await db
    .update(candidatePortalNotifications)
    .set({ readAt: null })
    .where(
      and(
        eq(candidatePortalNotifications.id, parsed.data.notificationId),
        eq(candidatePortalNotifications.workspaceId, session.workspaceId),
        eq(candidatePortalNotifications.candidateId, session.candidateId),
      ),
    );

  revalidatePortalNotifications();
  return { success: true };
}

export async function markAllCandidatePortalNotificationsRead(): Promise<{
  success: boolean;
}> {
  const session = await getCandidatePortalSession();
  if (!session) return { success: false };

  await db
    .update(candidatePortalNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(candidatePortalNotifications.workspaceId, session.workspaceId),
        eq(candidatePortalNotifications.candidateId, session.candidateId),
        isNull(candidatePortalNotifications.readAt),
      ),
    );

  revalidatePortalNotifications();
  return { success: true };
}
