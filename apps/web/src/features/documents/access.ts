import "server-only";

import { and, eq } from "drizzle-orm";

import {
  db,
  documentAccessMembers,
  documentAccessRoles,
  documents,
} from "@harly/db";
import { documentAccessIsExplicit, resolveDocumentAccessLevel } from "./access-policy";

export type DocumentAccess = "read" | "manage";

/** ACL-only resolver. Kept free of auth/session imports so it is safe to use
 * from other server actions that already resolved their workspace context. */
export async function getDocumentAccessForUser(input: {
  documentId: string;
  workspaceId: string;
  userId: string;
  roleKey: string;
}): Promise<{
  document: typeof documents.$inferSelect;
  level: DocumentAccess;
  /** True when access comes from ownership, an admin role, or an ACL rule naming the viewer. */
  aclGranted: boolean;
} | null> {
  const [document] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!document) return null;
  if (
    input.roleKey === "owner" ||
    input.roleKey === "admin" ||
    document.ownerId === input.userId
  ) {
    return { document, level: "manage", aclGranted: true };
  }
  const [memberRules, roleRules] = await Promise.all([
    db
      .select({
        userId: documentAccessMembers.userId,
        accessLevel: documentAccessMembers.accessLevel,
      })
      .from(documentAccessMembers)
      .where(eq(documentAccessMembers.documentId, input.documentId)),
    db
      .select({
        roleKey: documentAccessRoles.roleKey,
        accessLevel: documentAccessRoles.accessLevel,
      })
      .from(documentAccessRoles)
      .where(eq(documentAccessRoles.documentId, input.documentId)),
  ]);
  const level = resolveDocumentAccessLevel({
    ownerId: document.ownerId,
    userId: input.userId,
    roleKey: input.roleKey,
    memberRules: memberRules.map((rule) => ({
      ...rule,
      accessLevel: rule.accessLevel as "read" | "manage",
    })),
    roleRules: roleRules.map((rule) => ({
      ...rule,
      accessLevel: rule.accessLevel as "read" | "manage",
    })),
  });
  if (!level) return null;
  return {
    document,
    level,
    aclGranted: documentAccessIsExplicit({
      ownerId: document.ownerId,
      userId: input.userId,
      roleKey: input.roleKey,
      memberRules: memberRules.map((rule) => ({ userId: rule.userId })),
      roleRules: roleRules.map((rule) => ({ roleKey: rule.roleKey })),
    }),
  };
}
