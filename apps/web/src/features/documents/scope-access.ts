import "server-only";

import { and, eq } from "drizzle-orm";

import { db, documentAssociations, documents } from "@harly/db";

import { getRolePolicy } from "@/features/workspaces/permissions-server";
import { getDocumentAccessForUser, type DocumentAccess } from "./access";
import {
  documentHiddenByAssociationScope,
  visibleAssociationTargets,
  type DocumentAssociationTarget,
} from "./association-scope";

export type DocumentAccessInScope = {
  document: typeof documents.$inferSelect;
  level: DocumentAccess;
};

export type DocumentAccessScopeInput = {
  documentId: string;
  workspaceId: string;
  userId: string;
  roleKey: string;
};

/**
 * The one resolver every document read and write goes through. ACL resolution
 * runs first. Access that comes only from the workspace-wide default (no
 * explicit grant) is then withdrawn when every association of the document is
 * outside the caller's role scope. Ownership, an admin role and an ACL rule
 * that names the caller stay authoritative.
 *
 * Returns null when the document does not exist for this workspace, when the
 * caller has no access, or when the document is out of scope. Callers keep
 * their own level checks (read or manage) and their own error messages.
 */
export async function resolveDocumentAccessInScope(
  input: DocumentAccessScopeInput,
): Promise<DocumentAccessInScope | null> {
  const access = await getDocumentAccessForUser(input);
  if (!access) return null;
  if (access.aclGranted) return { document: access.document, level: access.level };

  const associations: DocumentAssociationTarget[] = await db
    .select({
      targetType: documentAssociations.targetType,
      targetId: documentAssociations.targetId,
    })
    .from(documentAssociations)
    .where(
      and(
        eq(documentAssociations.workspaceId, input.workspaceId),
        eq(documentAssociations.documentId, input.documentId),
      ),
    );
  const policy = await getRolePolicy(input.workspaceId, input.roleKey);
  const visibleTargets = await visibleAssociationTargets(
    { workspaceId: input.workspaceId, userId: input.userId, permissions: policy.permissions, scope: policy.scope },
    associations,
  );
  if (documentHiddenByAssociationScope({ associations, visibleTargets, aclGranted: false })) {
    return null;
  }
  return { document: access.document, level: access.level };
}

/**
 * Whether the caller may point a document at these association targets. The
 * rule is the one the document lists use: a candidate, job, application or
 * offer target must sit inside the caller's scope, and a workspace-level
 * association has no record to judge and is always allowed. Unrestricted
 * callers skip the queries.
 */
export async function associationTargetsInScope(
  input: { workspaceId: string; userId: string; roleKey: string },
  targets: DocumentAssociationTarget[],
): Promise<boolean> {
  const policy = await getRolePolicy(input.workspaceId, input.roleKey);
  const actor = { workspaceId: input.workspaceId, userId: input.userId, permissions: policy.permissions, scope: policy.scope };
  const visible = await visibleAssociationTargets(actor, targets);
  return targets.every((target) => target.targetType === "workspace" || visible.has(`${target.targetType}:${target.targetId ?? ""}`));
}
