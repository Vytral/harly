import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { candidatePortalNotifications, candidates, db } from "@harly/db";

export type CandidatePortalNotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
};

export async function listCandidatePortalNotifications(input: {
  workspaceId: string;
  candidateId: string;
  limit?: number;
}): Promise<CandidatePortalNotificationItem[]> {
  const rows = await db
    .select({
      id: candidatePortalNotifications.id,
      type: candidatePortalNotifications.type,
      title: candidatePortalNotifications.title,
      body: candidatePortalNotifications.body,
      href: candidatePortalNotifications.href,
      readAt: candidatePortalNotifications.readAt,
      createdAt: candidatePortalNotifications.createdAt,
    })
    .from(candidatePortalNotifications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, candidatePortalNotifications.candidateId),
        eq(candidates.workspaceId, candidatePortalNotifications.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .where(
      and(
        eq(candidatePortalNotifications.workspaceId, input.workspaceId),
        eq(candidatePortalNotifications.candidateId, input.candidateId),
      ),
    )
    .orderBy(desc(candidatePortalNotifications.createdAt))
    .limit(input.limit ?? 100);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getCandidatePortalUnreadNotificationCount(input: {
  workspaceId: string;
  candidateId: string;
}): Promise<number> {
  const rows = await db
    .select({ id: candidatePortalNotifications.id })
    .from(candidatePortalNotifications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, candidatePortalNotifications.candidateId),
        eq(candidates.workspaceId, candidatePortalNotifications.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .where(
      and(
        eq(candidatePortalNotifications.workspaceId, input.workspaceId),
        eq(candidatePortalNotifications.candidateId, input.candidateId),
        isNull(candidatePortalNotifications.readAt),
      ),
    )
    .limit(100);

  return rows.length;
}
