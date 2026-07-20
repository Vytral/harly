import "server-only";

import { and, eq } from "drizzle-orm";

import {
  db,
  documentAccessMembers,
  documentAccessRoles,
  documents,
} from "@harly/db";

export type DocumentAccess = "read" | "manage";

/** ACL-only resolver. Kept free of auth/session imports so it is safe to use
 * from other server actions that already resolved their workspace context. */
export async function getDocumentAccessForUser(input: {
  documentId: string;
  workspaceId: string;
  userId: string;
  roleKey: string;
}): Promise<{ document: typeof documents.$inferSelect; level: DocumentAccess } | null> {
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId)))
    .limit(1);
  if (!document) return null;
  if (input.roleKey === "owner" || input.roleKey === "admin" || document.ownerId === input.userId) {
    return { document, level: "manage" };
  }
  const [memberRule, roleRule, ruleCounts] = await Promise.all([
    db.select({ accessLevel: documentAccessMembers.accessLevel }).from(documentAccessMembers).where(and(eq(documentAccessMembers.documentId, input.documentId), eq(documentAccessMembers.userId, input.userId))).limit(1),
    db.select({ accessLevel: documentAccessRoles.accessLevel }).from(documentAccessRoles).where(and(eq(documentAccessRoles.documentId, input.documentId), eq(documentAccessRoles.roleKey, input.roleKey))).limit(1),
    Promise.all([
      db.select({ id: documentAccessMembers.id }).from(documentAccessMembers).where(eq(documentAccessMembers.documentId, input.documentId)),
      db.select({ id: documentAccessRoles.id }).from(documentAccessRoles).where(eq(documentAccessRoles.documentId, input.documentId)),
    ]),
  ]);
  const explicitAcl = ruleCounts[0].length + ruleCounts[1].length > 0;
  const level = memberRule[0]?.accessLevel ?? roleRule[0]?.accessLevel;
  if (level === "manage") return { document, level: "manage" };
  if (level === "read") return { document, level: "read" };
  return explicitAcl ? null : { document, level: "read" };
}
