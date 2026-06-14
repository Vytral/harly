import "server-only";

import { and, eq } from "drizzle-orm";

import { db, member } from "@harly/db";

/**
 * Resolve the user id to attribute API-initiated writes to. Records like jobs
 * require a non-null `createdById`; an API key isn't a user, so we attribute to
 * the key's creator when they're still a member, otherwise to a workspace owner.
 */
export async function resolveWorkspaceActorUserId(
  workspaceId: string,
  preferredUserId?: string | null,
): Promise<string | null> {
  if (preferredUserId) {
    const [membership] = await db
      .select({ userId: member.userId })
      .from(member)
      .where(
        and(
          eq(member.organizationId, workspaceId),
          eq(member.userId, preferredUserId),
        ),
      )
      .limit(1);
    if (membership) return membership.userId;
  }

  const [owner] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(eq(member.organizationId, workspaceId), eq(member.role, "owner")),
    )
    .limit(1);

  return owner?.userId ?? null;
}
