"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  activityEvents,
  applications,
  candidates,
  db,
  documentAccessMembers,
  documentAccessRoles,
  documentAssociations,
  documentAssignments,
  documentCategories,
  documentLegalHolds,
  documentVersions,
  documents,
  jobs,
  member as authMembers,
  offers,
} from "@harly/db";

import { getDocumentAccessForUser } from "./access";
import { slugifyDocumentCategory } from "./shared";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { isWorkspaceStorageKey } from "@/lib/storage-validation";
import { documentExtensionMatches, maxDocumentFileSize } from "@/lib/storage-validation";
import { storage } from "@/lib/storage";
import { isExternallyManagedSignatureProvider } from "@/lib/docusign/signature-state";

const documentIdSchema = z.object({ documentId: z.uuid() });
const associationSchema = z.object({
  targetType: z.enum(["workspace", "job", "candidate", "application", "offer"]),
  targetId: z.uuid().nullable(),
});
const accessLevelSchema = z.enum(["read", "manage"]);

export type DocumentActionResult = { ok: boolean; error?: string; documentId?: string };

type DocumentPermissionContext = {
  context: Awaited<ReturnType<typeof requirePermission>>;
  error?: string;
};

async function documentContext(permission: "documents:manage" | "documents:share"): Promise<DocumentPermissionContext> {
  try {
    return { context: await requirePermission(permission) };
  } catch {
    return { context: undefined as never, error: "You do not have permission to manage documents." };
  }
}

async function logDocumentActivity(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { workspaceId: string; actorId: string; documentId: string; type: string; metadata?: Record<string, unknown> },
) {
  await tx.insert(activityEvents).values({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    entityType: "document",
    entityId: input.documentId,
    type: input.type,
    metadata: input.metadata ?? {},
  });
}

async function targetBelongsToWorkspace(
  workspaceId: string,
  association: z.infer<typeof associationSchema>,
) {
  if (association.targetType === "workspace") return association.targetId === null;
  if (!association.targetId) return false;
  if (association.targetType === "candidate") {
    const [row] = await db.select({ id: candidates.id }).from(candidates).where(and(eq(candidates.id, association.targetId), eq(candidates.workspaceId, workspaceId))).limit(1);
    return Boolean(row);
  }
  if (association.targetType === "job") {
    const [row] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, association.targetId), eq(jobs.workspaceId, workspaceId))).limit(1);
    return Boolean(row);
  }
  if (association.targetType === "application") {
    const [row] = await db.select({ id: applications.id }).from(applications).where(and(eq(applications.id, association.targetId), eq(applications.workspaceId, workspaceId))).limit(1);
    return Boolean(row);
  }
  const [row] = await db.select({ id: offers.id }).from(offers).where(and(eq(offers.id, association.targetId), eq(offers.workspaceId, workspaceId))).limit(1);
  return Boolean(row);
}

async function verifyUploadedDocument(input: {
  workspaceId: string;
  storageKey: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}) {
  if (!isWorkspaceStorageKey(input.workspaceId, input.storageKey, "documents")) {
    return { error: "The upload does not belong to this workspace." };
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > maxDocumentFileSize) {
    return { error: "Document is empty or exceeds the 25 MB limit." };
  }
  if (!documentExtensionMatches(input.name, input.mimeType)) {
    return { error: "The file extension does not match its content type." };
  }
  let buffer: Buffer;
  try {
    buffer = await storage.read(input.storageKey);
  } catch {
    return { error: "The uploaded file could not be read." };
  }
  if (buffer.byteLength !== input.sizeBytes) return { error: "Uploaded file size could not be verified." };
  const checksum = createHash("sha256").update(buffer).digest("hex");
  if (checksum !== input.checksum.toLowerCase()) return { error: "Uploaded file checksum could not be verified." };
  return { buffer, checksum };
}

export async function createDocument(input: {
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storageKey: string;
  categoryId: string | null;
  association: z.input<typeof associationSchema>;
  ownerId?: string | null;
}): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsedAssociation = associationSchema.safeParse(input.association);
  if (!parsedAssociation.success) return { ok: false, error: "Invalid document association." };
  const name = input.name.trim().replace(/[\r\n]/g, "").slice(0, 255);
  const originalName = input.originalName.trim().replace(/[\r\n]/g, "").slice(0, 255);
  if (!name || !originalName || !input.mimeType || !Number.isInteger(input.sizeBytes)) return { ok: false, error: "Invalid document metadata." };
  const checked = await verifyUploadedDocument({
    workspaceId: context.organization.id,
    storageKey: input.storageKey,
    name: originalName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksum: input.checksum,
  });
  if ("error" in checked) return { ok: false, error: checked.error };
  if (!await targetBelongsToWorkspace(context.organization.id, parsedAssociation.data)) return { ok: false, error: "The selected association was not found." };
  if (input.categoryId) {
    const [category] = await db.select({ id: documentCategories.id }).from(documentCategories).where(and(eq(documentCategories.id, input.categoryId), eq(documentCategories.workspaceId, context.organization.id), eq(documentCategories.active, true))).limit(1);
    if (!category) return { ok: false, error: "Category not found." };
  }
  if (input.ownerId) {
    const [owner] = await db.select({ userId: authMembers.userId }).from(authMembers).where(and(eq(authMembers.organizationId, context.organization.id), eq(authMembers.userId, input.ownerId))).limit(1);
    if (!owner) return { ok: false, error: "Document owner is not a workspace member." };
  }

  const created = await db.transaction(async (tx) => {
    const [document] = await tx.insert(documents).values({
      workspaceId: context.organization.id,
      name,
      originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksum: checked.checksum,
      storageKey: input.storageKey,
      categoryId: input.categoryId,
      ownerId: input.ownerId ?? context.user.id,
      createdById: context.user.id,
    }).returning({ id: documents.id });
    if (!document) throw new Error("Document could not be saved.");
    await tx.insert(documentVersions).values({
      workspaceId: context.organization.id,
      documentId: document.id,
      versionNumber: 1,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes,
      checksum: checked.checksum,
      uploadedById: context.user.id,
    });
    await tx.insert(documentAssociations).values({
      workspaceId: context.organization.id,
      documentId: document.id,
      targetType: parsedAssociation.data.targetType,
      targetId: parsedAssociation.data.targetId,
      createdById: context.user.id,
    });
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: document.id, type: "document.uploaded", metadata: { name, mimeType: input.mimeType, sizeBytes: input.sizeBytes } });
    return document;
  });
  revalidatePath("/dashboard/documents");
  if (parsedAssociation.data.targetType === "candidate" && parsedAssociation.data.targetId) revalidatePath(`/dashboard/candidates/${parsedAssociation.data.targetId}`);
  return { ok: true, documentId: created.id };
}

export async function renameDocument(input: { documentId: string; name: string }): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ name: z.string().trim().min(1).max(255) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Document name is invalid." };
  const access = await getDocumentAccessForUser({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot edit this document." };
  await db.transaction(async (tx) => {
    await tx.update(documents).set({ name: parsed.data.name.replace(/[\r\n]/g, "") }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)));
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: "document.renamed", metadata: { name: parsed.data.name } });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function setDocumentStatus(input: { documentId: string; status: "active" | "archived" }): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ status: z.enum(["active", "archived"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid document status." };
  const access = await getDocumentAccessForUser({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot edit this document." };
  if (parsed.data.status === "archived") {
    const [activeHold] = await db
      .select({ id: documentLegalHolds.id })
      .from(documentLegalHolds)
      .where(
        and(
          eq(documentLegalHolds.workspaceId, context.organization.id),
          eq(documentLegalHolds.documentId, input.documentId),
          isNull(documentLegalHolds.releasedAt),
        ),
      )
      .limit(1);
    if (activeHold) {
      return {
        ok: false,
        error: "This document is under legal hold and cannot be archived until every hold is released.",
      };
    }
  }
  await db.transaction(async (tx) => {
    await tx.update(documents).set({ status: parsed.data.status }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)));
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: parsed.data.status === "archived" ? "document.archived" : "document.restored" });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function placeDocumentLegalHold(input: {
  documentId: string;
  reason: string;
  reference?: string | null;
}): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema
    .extend({
      reason: z.string().trim().min(3).max(2000),
      reference: z.string().trim().max(160).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a reason for the legal hold." };
  const access = await getDocumentAccessForUser({
    documentId: input.documentId,
    workspaceId: context.organization.id,
    userId: context.user.id,
    roleKey: context.roleKey,
  });
  if (!access || access.level !== "manage") {
    return { ok: false, error: "You cannot place a legal hold on this document." };
  }
  await db.transaction(async (tx) => {
    const [hold] = await tx
      .insert(documentLegalHolds)
      .values({
        workspaceId: context.organization.id,
        documentId: input.documentId,
        reason: parsed.data.reason,
        reference: parsed.data.reference || null,
        placedById: context.user.id,
      })
      .returning({ id: documentLegalHolds.id });
    if (!hold) throw new Error("Legal hold could not be created.");
    await logDocumentActivity(tx, {
      workspaceId: context.organization.id,
      actorId: context.user.id,
      documentId: input.documentId,
      type: "document.legal_hold_placed",
      metadata: { holdId: hold.id, reference: parsed.data.reference || null },
    });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function releaseDocumentLegalHold(input: {
  holdId: string;
  releaseReason: string;
}): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = z
    .object({
      holdId: z.uuid(),
      releaseReason: z.string().trim().min(3).max(2000),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a reason for releasing the legal hold." };
  const [hold] = await db
    .select({ id: documentLegalHolds.id, documentId: documentLegalHolds.documentId })
    .from(documentLegalHolds)
    .where(
      and(
        eq(documentLegalHolds.id, parsed.data.holdId),
        eq(documentLegalHolds.workspaceId, context.organization.id),
        isNull(documentLegalHolds.releasedAt),
      ),
    )
    .limit(1);
  if (!hold) return { ok: false, error: "Active legal hold not found." };
  const access = await getDocumentAccessForUser({
    documentId: hold.documentId,
    workspaceId: context.organization.id,
    userId: context.user.id,
    roleKey: context.roleKey,
  });
  if (!access || access.level !== "manage") {
    return { ok: false, error: "You cannot release this legal hold." };
  }
  await db.transaction(async (tx) => {
    await tx
      .update(documentLegalHolds)
      .set({
        releasedById: context.user.id,
        releasedAt: new Date(),
        releaseReason: parsed.data.releaseReason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentLegalHolds.id, parsed.data.holdId),
          eq(documentLegalHolds.workspaceId, context.organization.id),
          isNull(documentLegalHolds.releasedAt),
        ),
      );
    await logDocumentActivity(tx, {
      workspaceId: context.organization.id,
      actorId: context.user.id,
      documentId: hold.documentId,
      type: "document.legal_hold_released",
      metadata: { holdId: parsed.data.holdId },
    });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function setDocumentCategory(input: { documentId: string; categoryId: string | null }): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ categoryId: z.uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid category." };
  const access = await getDocumentAccessForUser({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot edit this document." };
  if (parsed.data.categoryId) {
    const [category] = await db.select({ id: documentCategories.id }).from(documentCategories).where(and(eq(documentCategories.id, parsed.data.categoryId), eq(documentCategories.workspaceId, context.organization.id), eq(documentCategories.active, true))).limit(1);
    if (!category) return { ok: false, error: "Category not found." };
  }
  await db.transaction(async (tx) => {
    await tx.update(documents).set({ categoryId: parsed.data.categoryId }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)));
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: "document.category_changed", metadata: { categoryId: parsed.data.categoryId } });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function createDocumentVersion(input: { documentId: string; originalName: string; mimeType: string; sizeBytes: number; checksum: string; storageKey: string }): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const access = await getDocumentAccessForUser({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot edit this document." };
  if (["signed", "pending"].includes(access.document.signatureStatus)) return { ok: false, error: "Signed documents cannot be replaced. Create a new document instead." };
  const checked = await verifyUploadedDocument({ workspaceId: context.organization.id, storageKey: input.storageKey, name: input.originalName, mimeType: input.mimeType, sizeBytes: input.sizeBytes, checksum: input.checksum });
  if ("error" in checked) return { ok: false, error: checked.error };
  const [current] = await db.select({ versionNumber: documentVersions.versionNumber }).from(documentVersions).where(eq(documentVersions.documentId, input.documentId)).orderBy(desc(documentVersions.versionNumber)).limit(1);
  const versionNumber = (current?.versionNumber ?? 0) + 1;
  await db.transaction(async (tx) => {
    await tx.update(documentVersions).set({ isCurrent: false }).where(eq(documentVersions.documentId, input.documentId));
    await tx.insert(documentVersions).values({ workspaceId: context.organization.id, documentId: input.documentId, versionNumber, storageKey: input.storageKey, sizeBytes: input.sizeBytes, checksum: checked.checksum, uploadedById: context.user.id });
    await tx.update(documents).set({ storageKey: input.storageKey, sizeBytes: input.sizeBytes, checksum: checked.checksum, mimeType: input.mimeType, originalName: input.originalName.replace(/[\r\n]/g, "") }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)));
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: "document.version_created", metadata: { versionNumber } });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function saveDocumentAcl(input: { documentId: string; roles: Array<{ roleKey: string; accessLevel: "read" | "manage" }>; members: Array<{ userId: string; accessLevel: "read" | "manage" }> }): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:share");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ roles: z.array(z.object({ roleKey: z.string().trim().min(1).max(80), accessLevel: accessLevelSchema })), members: z.array(z.object({ userId: z.string().min(1), accessLevel: accessLevelSchema })) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid access rules." };
  const access = await getDocumentAccessForUser({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot share this document." };
  const memberIds = parsed.data.members.map((member) => member.userId);
  if (memberIds.length) {
    const workspaceMembers = await db.select({ userId: authMembers.userId }).from(authMembers).where(and(eq(authMembers.organizationId, context.organization.id), inArray(authMembers.userId, memberIds)));
    if (workspaceMembers.length !== new Set(memberIds).size) return { ok: false, error: "Every selected member must belong to this workspace." };
  }
  await db.transaction(async (tx) => {
    await tx.delete(documentAccessRoles).where(eq(documentAccessRoles.documentId, input.documentId));
    await tx.delete(documentAccessMembers).where(eq(documentAccessMembers.documentId, input.documentId));
    if (parsed.data.roles.length) await tx.insert(documentAccessRoles).values(parsed.data.roles.map((role) => ({ workspaceId: context.organization.id, documentId: input.documentId, roleKey: role.roleKey, accessLevel: role.accessLevel })));
    if (parsed.data.members.length) await tx.insert(documentAccessMembers).values(parsed.data.members.map((member) => ({ workspaceId: context.organization.id, documentId: input.documentId, userId: member.userId, accessLevel: member.accessLevel })));
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: "document.permissions_changed", metadata: { roles: parsed.data.roles, memberCount: parsed.data.members.length } });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function assignDocument(input: { documentId: string; userId: string | null; assignmentType: "owner" | "reviewer" }): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ userId: z.string().min(1).nullable(), assignmentType: z.enum(["owner", "reviewer"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid assignment." };
  const access = await getDocumentAccessForUser({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot assign this document." };
  if (parsed.data.userId) {
    const [member] = await db.select({ userId: authMembers.userId }).from(authMembers).where(and(eq(authMembers.organizationId, context.organization.id), eq(authMembers.userId, parsed.data.userId))).limit(1);
    if (!member) return { ok: false, error: "Assignee is not a workspace member." };
  }
  await db.transaction(async (tx) => {
    await tx.delete(documentAssignments).where(and(eq(documentAssignments.documentId, input.documentId), eq(documentAssignments.assignmentType, input.assignmentType)));
    if (parsed.data.userId) await tx.insert(documentAssignments).values({ workspaceId: context.organization.id, documentId: input.documentId, userId: parsed.data.userId, assignmentType: input.assignmentType, createdById: context.user.id });
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: parsed.data.userId ? "document.assigned" : "document.unassigned", metadata: { userId: parsed.data.userId, assignmentType: input.assignmentType } });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function saveDocumentSignature(input: { documentId: string; status: "unsigned" | "pending" | "signed" | "declined" | "expired"; provider?: string | null; envelopeId?: string | null; url?: string | null; expiresAt?: string | null }): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ status: z.enum(["unsigned", "pending", "signed", "declined", "expired"]), provider: z.string().max(80).nullable().optional(), envelopeId: z.string().max(255).nullable().optional(), url: z.url().nullable().optional(), expiresAt: z.iso.datetime().nullable().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid signature details." };
  const access = await getDocumentAccessForUser({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot update this document." };
  if (
    isExternallyManagedSignatureProvider(access.document.signatureProvider) ||
    isExternallyManagedSignatureProvider(parsed.data.provider)
  ) {
    return {
      ok: false,
      error: "DocuSign signature status is controlled by verified Connect events.",
    };
  }
  if (access.document.signatureStatus === "signed" && parsed.data.status !== "signed") {
    return { ok: false, error: "Signed documents are immutable. Create a new document for another signature cycle." };
  }
  await db.transaction(async (tx) => {
    await tx.update(documents).set({ signatureStatus: parsed.data.status, signatureProvider: parsed.data.provider ?? null, signatureEnvelopeId: parsed.data.envelopeId ?? null, signatureUrl: parsed.data.url ?? null, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)));
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: "document.signature_changed", metadata: { status: parsed.data.status, provider: parsed.data.provider ?? null, envelopeId: parsed.data.envelopeId ?? null } });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function createDocumentCategory(input: { name: string; accent?: string }): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Category name is required." };
  const slug = slugifyDocumentCategory(name);
  try {
    await db.insert(documentCategories).values({ workspaceId: context.organization.id, name, slug, accent: input.accent?.trim().slice(0, 30) || "pine" });
  } catch {
    return { ok: false, error: "A category with that name already exists." };
  }
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function updateDocumentCategory(input: { categoryId: string; name: string; accent?: string; active: boolean }): Promise<DocumentActionResult> {
  const permission = await documentContext("documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = z.object({ categoryId: z.uuid(), name: z.string().trim().min(1).max(80), accent: z.string().trim().max(30).optional(), active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid category." };
  await db.update(documentCategories).set({ name: parsed.data.name, slug: slugifyDocumentCategory(parsed.data.name), accent: parsed.data.accent || "pine", active: parsed.data.active }).where(and(eq(documentCategories.id, input.categoryId), eq(documentCategories.workspaceId, context.organization.id)));
  revalidatePath("/dashboard/documents");
  return { ok: true };
}
