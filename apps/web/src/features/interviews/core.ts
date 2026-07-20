import "server-only";

import { and, eq } from "drizzle-orm";

import { db, member } from "@harly/db";

/** Shared membership query for the server-action and REST API layers. Both
 *  previously had their own copy (isWorkspaceMember in actions.ts returning a
 *  bool, assertWorkspaceMember in service.ts throwing); the underlying query is
 *  the same, so keep it here to avoid drift. Returns the membership row (or
 *  null) so each layer can decide its own error shape. */
export async function findWorkspaceMember(
  workspaceId: string,
  userId: string,
) {
  const [row] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(
        eq(member.organizationId, workspaceId),
        eq(member.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}
