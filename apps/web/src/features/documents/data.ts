import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import {
  db,
  activityEvents,
  documentAccessMembers,
  documentAccessRoles,
  documentAssociations,
  documentAssignments,
  documentCategories,
  documentLegalHolds,
  documentVersions,
  documents,
  candidates,
  jobs,
  member as authMembers,
  user as authUsers,
} from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { can, getRolePermissions } from "@/features/workspaces/permissions-server";
import { getDocumentAccessForUser, type DocumentAccess } from "./access";
import type {
  DocumentCategoryItem,
  DocumentHubData,
  DocumentListItem,
  DocumentMember,
} from "./shared";

export async function getDocumentAccess(
  documentId: string,
  input?: { workspaceId?: string; userId?: string; roleKey?: string },
): Promise<{ document: typeof documents.$inferSelect; level: DocumentAccess } | null> {
  const context = input?.workspaceId
    ? null
    : await getWorkspaceContext();
  const workspaceId = input?.workspaceId ?? context!.organization.id;
  const userId = input?.userId ?? context!.user.id;
  const roleKey = input?.roleKey ?? context!.roleKey;
  return getDocumentAccessForUser({ documentId, workspaceId, userId, roleKey });
}

export async function listDocumentCategories(): Promise<DocumentCategoryItem[]> {
  const { organization } = await getWorkspaceContext();
  const rows = await db
    .select({
      id: documentCategories.id,
      name: documentCategories.name,
      slug: documentCategories.slug,
      accent: documentCategories.accent,
      active: documentCategories.active,
    })
    .from(documentCategories)
    .where(eq(documentCategories.workspaceId, organization.id))
    .orderBy(documentCategories.name);
  return rows;
}

export async function listDocumentMembers(): Promise<DocumentMember[]> {
  const { organization } = await getWorkspaceContext();
  return db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      role: authMembers.role,
    })
    .from(authMembers)
    .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
    .where(eq(authMembers.organizationId, organization.id))
    .orderBy(authUsers.name);
}

export async function listDocumentsForCandidate(candidateId: string) {
  if (!(await can("documents:read"))) return [];
  const { organization, user, roleKey } = await getWorkspaceContext();
  const associations = await db
    .select({ documentId: documentAssociations.documentId })
    .from(documentAssociations)
    .where(
      and(
        eq(documentAssociations.workspaceId, organization.id),
        eq(documentAssociations.targetType, "candidate"),
        eq(documentAssociations.targetId, candidateId),
      ),
    );
  const ids = associations.map((row) => row.documentId);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: documents.id, name: documents.name, mimeType: documents.mimeType })
    .from(documents)
    .where(and(eq(documents.workspaceId, organization.id), inArray(documents.id, ids)));
  const visible = await Promise.all(
    rows.map(async (row) => {
      const access = await getDocumentAccess(row.id, {
        workspaceId: organization.id,
        userId: user.id,
        roleKey,
      });
      return access ? row : null;
    }),
  );
  return visible.filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function getDocumentHubData(): Promise<DocumentHubData> {
  const { organization, user, roleKey } = await getWorkspaceContext();
  const [rows, categories, members, rolePermissions, candidateOptions, jobOptions, versionRows] = await Promise.all([
    db
      .select({
        id: documents.id,
        name: documents.name,
        originalName: documents.originalName,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        checksum: documents.checksum,
        status: documents.status,
        signatureStatus: documents.signatureStatus,
        signatureProvider: documents.signatureProvider,
        signatureEnvelopeId: documents.signatureEnvelopeId,
        signatureUrl: documents.signatureUrl,
        expiresAt: documents.expiresAt,
        ownerId: documents.ownerId,
        ownerName: authUsers.name,
        createdByName: authUsers.name,
        categoryId: documents.categoryId,
        updatedAt: documents.updatedAt,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .leftJoin(authUsers, eq(authUsers.id, documents.ownerId))
      .where(eq(documents.workspaceId, organization.id))
      .orderBy(desc(documents.updatedAt)),
    listDocumentCategories(),
    listDocumentMembers(),
    getRolePermissions(organization.id, roleKey),
    db.select({ id: candidates.id, label: candidates.firstName, lastName: candidates.lastName }).from(candidates).where(eq(candidates.workspaceId, organization.id)).orderBy(candidates.lastName, candidates.firstName),
    db.select({ id: jobs.id, label: jobs.title }).from(jobs).where(eq(jobs.workspaceId, organization.id)).orderBy(jobs.title),
    db.select({ documentId: documentVersions.documentId, versionNumber: documentVersions.versionNumber, isCurrent: documentVersions.isCurrent }).from(documentVersions).where(eq(documentVersions.workspaceId, organization.id)),
  ]);
  const [associationRows, accessRoleRows, accessMemberRows, assignmentRows, activityRows, legalHoldRows] = rows.length
    ? await Promise.all([
      db
        .select({ documentId: documentAssociations.documentId, targetType: documentAssociations.targetType })
        .from(documentAssociations)
        .where(
          and(
            eq(documentAssociations.workspaceId, organization.id),
            inArray(documentAssociations.documentId, rows.map((row) => row.id)),
          ),
        ),
      db.select({ documentId: documentAccessRoles.documentId, roleKey: documentAccessRoles.roleKey, accessLevel: documentAccessRoles.accessLevel }).from(documentAccessRoles).where(inArray(documentAccessRoles.documentId, rows.map((row) => row.id))),
      db.select({ documentId: documentAccessMembers.documentId, userId: documentAccessMembers.userId, accessLevel: documentAccessMembers.accessLevel }).from(documentAccessMembers).where(inArray(documentAccessMembers.documentId, rows.map((row) => row.id))),
      db.select({ documentId: documentAssignments.documentId, userId: documentAssignments.userId, assignmentType: documentAssignments.assignmentType }).from(documentAssignments).where(inArray(documentAssignments.documentId, rows.map((row) => row.id))),
      db.select({ documentId: activityEvents.entityId, id: activityEvents.id, type: activityEvents.type, actorName: authUsers.name, createdAt: activityEvents.createdAt }).from(activityEvents).leftJoin(authUsers, eq(authUsers.id, activityEvents.actorId)).where(and(eq(activityEvents.workspaceId, organization.id), eq(activityEvents.entityType, "document"), inArray(activityEvents.entityId, rows.map((row) => row.id)))).orderBy(desc(activityEvents.createdAt)).limit(200),
      db.select({ documentId: documentLegalHolds.documentId, id: documentLegalHolds.id, reason: documentLegalHolds.reason, reference: documentLegalHolds.reference, placedAt: documentLegalHolds.placedAt, releasedAt: documentLegalHolds.releasedAt }).from(documentLegalHolds).where(and(eq(documentLegalHolds.workspaceId, organization.id), inArray(documentLegalHolds.documentId, rows.map((row) => row.id)))).orderBy(desc(documentLegalHolds.placedAt)),
    ])
    : [[], [], [], [], [], []];
  const labels = new Map<string, string[]>();
  for (const row of associationRows) {
    const current = labels.get(row.documentId) ?? [];
    current.push(row.targetType[0]?.toUpperCase() + row.targetType.slice(1));
    labels.set(row.documentId, current);
  }
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const accessRolesByDocument = new Map<string, Array<{ roleKey: string; accessLevel: "read" | "manage" }>>();
  for (const row of accessRoleRows) {
    const current = accessRolesByDocument.get(row.documentId) ?? [];
    current.push({ roleKey: row.roleKey, accessLevel: row.accessLevel as "read" | "manage" });
    accessRolesByDocument.set(row.documentId, current);
  }
  const accessMembersByDocument = new Map<string, Array<{ userId: string; accessLevel: "read" | "manage" }>>();
  for (const row of accessMemberRows) {
    const current = accessMembersByDocument.get(row.documentId) ?? [];
    current.push({ userId: row.userId, accessLevel: row.accessLevel as "read" | "manage" });
    accessMembersByDocument.set(row.documentId, current);
  }
  const assignmentsByDocument = new Map<string, Array<{ userId: string; assignmentType: "owner" | "reviewer" }>>();
  for (const row of assignmentRows) {
    const current = assignmentsByDocument.get(row.documentId) ?? [];
    current.push({ userId: row.userId, assignmentType: row.assignmentType as "owner" | "reviewer" });
    assignmentsByDocument.set(row.documentId, current);
  }
  const activityByDocument = new Map<string, Array<{ id: string; type: string; actorName: string | null; createdAt: string }>>();
  for (const row of activityRows) {
    const current = activityByDocument.get(row.documentId) ?? [];
    if (current.length < 6) current.push({ id: row.id, type: row.type, actorName: row.actorName, createdAt: row.createdAt.toISOString() });
    activityByDocument.set(row.documentId, current);
  }
  const versionsByDocument = new Map<string, Array<{ versionNumber: number; isCurrent: boolean }>>();
  for (const row of versionRows) {
    const current = versionsByDocument.get(row.documentId) ?? [];
    current.push({ versionNumber: row.versionNumber, isCurrent: row.isCurrent });
    versionsByDocument.set(row.documentId, current);
  }
  const legalHoldsByDocument = new Map<string, Array<{ id: string; reason: string; reference: string | null; placedAt: string; releasedAt: string | null }>>();
  for (const row of legalHoldRows) {
    const current = legalHoldsByDocument.get(row.documentId) ?? [];
    current.push({
      id: row.id,
      reason: row.reason,
      reference: row.reference,
      placedAt: row.placedAt.toISOString(),
      releasedAt: row.releasedAt?.toISOString() ?? null,
    });
    legalHoldsByDocument.set(row.documentId, current);
  }
  const visible = await Promise.all(
    rows.map(async (row): Promise<DocumentListItem | null> => {
      const access = await getDocumentAccess(row.id, {
        workspaceId: organization.id,
        userId: user.id,
        roleKey,
      });
      if (!access) return null;
      return {
        ...row,
        status: row.status as DocumentListItem["status"],
        signatureStatus: row.signatureStatus as DocumentListItem["signatureStatus"],
        category: row.categoryId ? categoryById.get(row.categoryId) ?? null : null,
        associationLabels: [...new Set(labels.get(row.id) ?? ["Workspace"])],
        accessRoles: accessRolesByDocument.get(row.id) ?? [],
        accessMembers: accessMembersByDocument.get(row.id) ?? [],
        assignments: assignmentsByDocument.get(row.id) ?? [],
        activity: activityByDocument.get(row.id) ?? [],
        versionCount: versionsByDocument.get(row.id)?.length ?? 1,
        currentVersion: versionsByDocument.get(row.id)?.find((version) => version.isCurrent)?.versionNumber ?? 1,
        legalHolds: legalHoldsByDocument.get(row.id) ?? [],
        expiresAt: row.expiresAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      };
    }),
  );
  const permissionSet = new Set(rolePermissions);
  return {
    documents: visible.filter((row): row is DocumentListItem => Boolean(row)),
    categories,
    members,
    currentUserId: user.id,
    canManage: permissionSet.has("documents:manage"),
    canShare: permissionSet.has("documents:share"),
    associationOptions: [
      ...candidateOptions.map((candidate) => ({ type: "candidate" as const, id: candidate.id, label: `${candidate.label} ${candidate.lastName}` })),
      ...jobOptions.map((job) => ({ type: "job" as const, id: job.id, label: job.label })),
    ],
  };
}
