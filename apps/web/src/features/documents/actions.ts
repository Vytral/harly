"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { and, desc, eq, exists, ilike, inArray, isNull, or } from "drizzle-orm";
import { getTranslations } from "@/i18n/server";
import { z } from "zod";

import { ApiError } from "@harly/api";

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
  signatureArtifacts,
  documentVersions,
  documents,
  jobs,
  member as authMembers,
  offers,
  signatureEnvelopes,
  signatureRecipients,
} from "@harly/db";

import { associationTargetsInScope, resolveDocumentAccessInScope } from "./scope-access";
import { slugifyDocumentCategory } from "./shared";
import { verifyUploadedDocument as verifyUploadedDocumentShared } from "./verify";
import { requireOwnerOrAdmin, requirePermission, getRolePolicy } from "@/features/workspaces/permissions-server";
import { candidateScopeSql, jobScopeSql } from "@/features/search/scope";
import { listActiveWorkflowDocumentTemplates } from "@/features/document-templates/data";
import { generateDocumentForWorkflow } from "./workflow-generation";
import { renderTemplateForApplication } from "./generate-from-template";
import { remindNativeSigner, rotateNativePortalSigningLink } from "@/lib/esign/native/remote";
import type { GenerateTargetOption, GenerateTemplateOption } from "./shared";
import { isExternallyManagedSignatureProvider } from "@/lib/esign/signature-state";
import { sendDocumentForEnvelope } from "@/lib/esign/document-signing";
import { archiveSubmission, freshEsignContext } from "@/lib/esign/client";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { persistDomainEvent, publishPersistedDomainEvents } from "@/server/events/emit";
import { documentAutomationContext } from "@/lib/esign/document-automation-context";
import { voidNativeSignature } from "@/lib/esign/native/void";

const log = createLogger("documents-actions");

const documentIdSchema = z.object({ documentId: z.uuid() });
const associationSchema = z.object({
  targetType: z.enum(["workspace", "job", "candidate", "application", "offer"]),
  targetId: z.uuid().nullable(),
});
const accessLevelSchema = z.enum(["read", "manage"]);

export type DocumentActionResult = { ok: boolean; error?: string; documentId?: string };

type ActionT = Awaited<ReturnType<typeof getTranslations>>;

async function archivedDocumentError(t: ActionT, document: { status: string }) {
  if (document.status !== "archived") return null;
  return t("archivedReadOnly");
}

type DocumentPermissionContext = {
  context: Awaited<ReturnType<typeof requirePermission>>;
  error?: string;
};

async function documentContext(t: ActionT, permission: "documents:manage" | "documents:share"): Promise<DocumentPermissionContext> {
  try {
    return { context: await requirePermission(permission) };
  } catch {
    return { context: undefined as never, error: t("permissionDenied") };
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
    const [row] = await db.select({ id: candidates.id }).from(candidates).where(and(eq(candidates.id, association.targetId), eq(candidates.workspaceId, workspaceId), isNull(candidates.deletedAt))).limit(1);
    return Boolean(row);
  }
  if (association.targetType === "job") {
    const [row] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, association.targetId), eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt))).limit(1);
    return Boolean(row);
  }
  if (association.targetType === "application") {
    const [row] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.id, association.targetId),
          eq(applications.workspaceId, workspaceId),
          exists(
            db
              .select({ id: candidates.id })
              .from(candidates)
              .where(
                and(
                  eq(candidates.id, applications.candidateId),
                  eq(candidates.workspaceId, workspaceId),
                  isNull(candidates.deletedAt),
                ),
              ),
          ),
          exists(
            db
              .select({ id: jobs.id })
              .from(jobs)
              .where(
                and(
                  eq(jobs.id, applications.jobId),
                  eq(jobs.workspaceId, workspaceId),
                  isNull(jobs.deletedAt),
                ),
              ),
          ),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
  const [row] = await db
    .select({ id: offers.id })
    .from(offers)
    .where(
      and(
        eq(offers.id, association.targetId),
        eq(offers.workspaceId, workspaceId),
        exists(
          db
            .select({ id: candidates.id })
            .from(candidates)
            .where(
              and(
                eq(candidates.id, offers.candidateId),
                eq(candidates.workspaceId, workspaceId),
                isNull(candidates.deletedAt),
              ),
            ),
        ),
        exists(
          db
            .select({ id: jobs.id })
            .from(jobs)
            .where(
              and(
                eq(jobs.id, offers.jobId),
                eq(jobs.workspaceId, workspaceId),
                isNull(jobs.deletedAt),
              ),
            ),
        ),
      ),
    )
    .limit(1);
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
  return verifyUploadedDocumentShared(input);
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
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsedAssociation = associationSchema.safeParse(input.association);
  if (!parsedAssociation.success) return { ok: false, error: t("invalidAssociation") };
  const name = input.name.trim().replace(/[\r\n]/g, "").slice(0, 255);
  const originalName = input.originalName.trim().replace(/[\r\n]/g, "").slice(0, 255);
  if (!name || !originalName || !input.mimeType || !Number.isInteger(input.sizeBytes)) return { ok: false, error: t("invalidMetadata") };
  const checked = await verifyUploadedDocument({
    workspaceId: context.organization.id,
    storageKey: input.storageKey,
    name: originalName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksum: input.checksum,
  });
  if ("error" in checked) return { ok: false, error: checked.error };
  if (!await targetBelongsToWorkspace(context.organization.id, parsedAssociation.data)) return { ok: false, error: t("associationNotFound") };
  // Judged by the same scope rule the document lists use. An out-of-scope target
  // gets the same message as a missing one, so the caller learns nothing new.
  const inScope = await associationTargetsInScope(
    { workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey },
    [parsedAssociation.data],
  );
  if (!inScope) return { ok: false, error: t("associationNotFound") };
  if (input.categoryId) {
    const [category] = await db.select({ id: documentCategories.id }).from(documentCategories).where(and(eq(documentCategories.id, input.categoryId), eq(documentCategories.workspaceId, context.organization.id), eq(documentCategories.active, true))).limit(1);
    if (!category) return { ok: false, error: t("categoryNotFound") };
  }
  if (input.ownerId) {
    const [owner] = await db.select({ userId: authMembers.userId }).from(authMembers).where(and(eq(authMembers.organizationId, context.organization.id), eq(authMembers.userId, input.ownerId))).limit(1);
    if (!owner) return { ok: false, error: t("ownerNotMember") };
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
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ name: z.string().trim().min(1).max(255) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidName") };
  const access = await resolveDocumentAccessInScope({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: t("cannotEditDocument") };
  const archivedError = await archivedDocumentError(t, access.document);
  if (archivedError) return { ok: false, error: archivedError };
  await db.transaction(async (tx) => {
    await tx.update(documents).set({ name: parsed.data.name.replace(/[\r\n]/g, "") }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)));
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: "document.renamed", metadata: { name: parsed.data.name } });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function setDocumentStatus(input: { documentId: string; status: "active" | "archived" }): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ status: z.enum(["active", "archived"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidStatus") };
  const access = await resolveDocumentAccessInScope({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: t("cannotEditDocument") };
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
        error: t("archiveBlockedByHold"),
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

/** Owner/admin gate for document actions: a denial becomes an action result. */
async function requireOwnerOrAdminResult(message: string): Promise<DocumentActionResult | null> {
  try {
    await requireOwnerOrAdmin(message);
    return null;
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Permanently remove a document and every stored derivative. Owner/admin only. */
export async function deleteDocument(input: { documentId: string }): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const denied = await requireOwnerOrAdminResult(t("ownerOrAdminOnlyDelete"));
  if (denied) return denied;
  const { context } = permission;
  const parsed = documentIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidDocument") };
  const access = await resolveDocumentAccessInScope({
    documentId: input.documentId,
    workspaceId: context.organization.id,
    userId: context.user.id,
    roleKey: context.roleKey,
  });
  if (!access) return { ok: false, error: t("documentNotFound") };
  if (["pending"].includes(access.document.signatureStatus)) {
    return { ok: false, error: t("voidBeforeDelete") };
  }
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
  if (activeHold) return { ok: false, error: t("deleteBlockedByHold") };

  const versions = await db
    .select({ storageKey: documentVersions.storageKey })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, input.documentId));
  const artifacts = await db
    .select({ id: signatureArtifacts.id, storageKey: signatureArtifacts.storageKey })
    .from(signatureArtifacts)
    .where(
      and(
        eq(signatureArtifacts.workspaceId, context.organization.id),
        eq(signatureArtifacts.documentId, input.documentId),
      ),
    );
  const storageKeys = [...new Set([access.document.storageKey, ...versions.map((row) => row.storageKey), ...artifacts.map((row) => row.storageKey)])];

  await db.transaction(async (tx) => {
    await tx.delete(signatureArtifacts).where(
      and(
        eq(signatureArtifacts.workspaceId, context.organization.id),
        eq(signatureArtifacts.documentId, input.documentId),
      ),
    );
    await logDocumentActivity(tx, {
      workspaceId: context.organization.id,
      actorId: context.user.id,
      documentId: input.documentId,
      type: "document.deleted",
      metadata: { name: access.document.name, versionCount: versions.length },
    });
    await tx.delete(documents).where(
      and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)),
    );
  });

  const deletions = await Promise.allSettled(storageKeys.map((key) => storage.delete(key)));
  const failed = deletions.filter((result) => result.status === "rejected").length;
  if (failed > 0) log.warn({ documentId: input.documentId, failed, total: storageKeys.length }, "Some document storage objects could not be deleted");
  revalidatePath("/dashboard/documents");
  return { ok: true, documentId: input.documentId };
}

export async function placeDocumentLegalHold(input: {
  documentId: string;
  reason: string;
  reference?: string | null;
}): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema
    .extend({
      reason: z.string().trim().min(3).max(2000),
      reference: z.string().trim().max(160).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: t("legalHoldReasonRequired") };
  const access = await resolveDocumentAccessInScope({
    documentId: input.documentId,
    workspaceId: context.organization.id,
    userId: context.user.id,
    roleKey: context.roleKey,
  });
  if (!access || access.level !== "manage") {
    return { ok: false, error: t("cannotPlaceLegalHold") };
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
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = z
    .object({
      holdId: z.uuid(),
      releaseReason: z.string().trim().min(3).max(2000),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: t("releaseHoldReasonRequired") };
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
  if (!hold) return { ok: false, error: t("activeHoldNotFound") };
  const access = await resolveDocumentAccessInScope({
    documentId: hold.documentId,
    workspaceId: context.organization.id,
    userId: context.user.id,
    roleKey: context.roleKey,
  });
  if (!access || access.level !== "manage") {
    return { ok: false, error: t("cannotReleaseLegalHold") };
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
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ categoryId: z.uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidCategory") };
  const access = await resolveDocumentAccessInScope({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: t("cannotEditDocument") };
  const archivedError = await archivedDocumentError(t, access.document);
  if (archivedError) return { ok: false, error: archivedError };
  if (parsed.data.categoryId) {
    const [category] = await db.select({ id: documentCategories.id }).from(documentCategories).where(and(eq(documentCategories.id, parsed.data.categoryId), eq(documentCategories.workspaceId, context.organization.id), eq(documentCategories.active, true))).limit(1);
    if (!category) return { ok: false, error: t("categoryNotFound") };
  }
  await db.transaction(async (tx) => {
    await tx.update(documents).set({ categoryId: parsed.data.categoryId }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)));
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: "document.category_changed", metadata: { categoryId: parsed.data.categoryId } });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function createDocumentVersion(input: { documentId: string; originalName: string; mimeType: string; sizeBytes: number; checksum: string; storageKey: string }): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const access = await resolveDocumentAccessInScope({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: t("cannotEditDocument") };
  const archivedError = await archivedDocumentError(t, access.document);
  if (archivedError) return { ok: false, error: archivedError };
  if (["signed", "pending"].includes(access.document.signatureStatus)) return { ok: false, error: t("signedCannotReplace") };
  const checked = await verifyUploadedDocument({ workspaceId: context.organization.id, storageKey: input.storageKey, name: input.originalName, mimeType: input.mimeType, sizeBytes: input.sizeBytes, checksum: input.checksum });
  if ("error" in checked) return { ok: false, error: checked.error };
  const replaced = await db.transaction(async (tx) => {
    // Recheck under the document row lock that signing finalization also takes:
    // a signature that completes while the upload was being verified must win.
    const [locked] = await tx.select({ signatureStatus: documents.signatureStatus }).from(documents).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id))).for("update").limit(1);
    if (!locked || ["signed", "pending"].includes(locked.signatureStatus)) return false;
    const [current] = await tx.select({ versionNumber: documentVersions.versionNumber }).from(documentVersions).where(eq(documentVersions.documentId, input.documentId)).orderBy(desc(documentVersions.versionNumber)).limit(1);
    const versionNumber = (current?.versionNumber ?? 0) + 1;
    await tx.update(documentVersions).set({ isCurrent: false }).where(eq(documentVersions.documentId, input.documentId));
    await tx.insert(documentVersions).values({ workspaceId: context.organization.id, documentId: input.documentId, versionNumber, storageKey: input.storageKey, sizeBytes: input.sizeBytes, checksum: checked.checksum, uploadedById: context.user.id });
    await tx.update(documents).set({ storageKey: input.storageKey, sizeBytes: input.sizeBytes, checksum: checked.checksum, mimeType: input.mimeType, originalName: input.originalName.replace(/[\r\n]/g, "") }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)));
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: "document.version_created", metadata: { versionNumber } });
    return true;
  });
  if (!replaced) return { ok: false, error: t("signedCannotReplace") };
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function saveDocumentAcl(input: { documentId: string; roles: Array<{ roleKey: string; accessLevel: "read" | "manage" }>; members: Array<{ userId: string; accessLevel: "read" | "manage" }> }): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:share");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ roles: z.array(z.object({ roleKey: z.string().trim().min(1).max(80), accessLevel: accessLevelSchema })), members: z.array(z.object({ userId: z.string().min(1), accessLevel: accessLevelSchema })) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidAccessRules") };
  const access = await resolveDocumentAccessInScope({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: t("cannotShareDocument") };
  const archivedError = await archivedDocumentError(t, access.document);
  if (archivedError) return { ok: false, error: archivedError };
  const memberIds = parsed.data.members.map((member) => member.userId);
  if (memberIds.length) {
    const workspaceMembers = await db.select({ userId: authMembers.userId }).from(authMembers).where(and(eq(authMembers.organizationId, context.organization.id), inArray(authMembers.userId, memberIds)));
    if (workspaceMembers.length !== new Set(memberIds).size) return { ok: false, error: t("membersNotInWorkspace") };
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
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ userId: z.string().min(1).nullable(), assignmentType: z.enum(["owner", "reviewer"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidAssignment") };
  const access = await resolveDocumentAccessInScope({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: t("cannotAssignDocument") };
  const archivedError = await archivedDocumentError(t, access.document);
  if (archivedError) return { ok: false, error: archivedError };
  if (parsed.data.userId) {
    const [member] = await db.select({ userId: authMembers.userId }).from(authMembers).where(and(eq(authMembers.organizationId, context.organization.id), eq(authMembers.userId, parsed.data.userId))).limit(1);
    if (!member) return { ok: false, error: t("assigneeNotMember") };
  }
  await db.transaction(async (tx) => {
    await tx.delete(documentAssignments).where(and(eq(documentAssignments.documentId, input.documentId), eq(documentAssignments.assignmentType, input.assignmentType)));
    if (parsed.data.userId) await tx.insert(documentAssignments).values({ workspaceId: context.organization.id, documentId: input.documentId, userId: parsed.data.userId, assignmentType: input.assignmentType, createdById: context.user.id });
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: parsed.data.userId ? "document.assigned" : "document.unassigned", metadata: { userId: parsed.data.userId, assignmentType: input.assignmentType } });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function saveDocumentSignature(input: { documentId: string; status: "unsigned" | "pending" | "signed" | "declined" | "expired"; provider?: string | null; envelopeId?: string | null; url?: string | null; expiresAt?: string | null; attestationNote?: string | null }): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ status: z.enum(["unsigned", "pending", "signed", "declined", "expired"]), provider: z.string().max(80).nullable().optional(), envelopeId: z.string().max(255).nullable().optional(), url: z.url().nullable().optional(), expiresAt: z.iso.datetime().nullable().optional(), attestationNote: z.string().trim().max(2000).nullable().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidSignatureDetails") };
  const access = await resolveDocumentAccessInScope({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: t("cannotUpdateDocument") };
  const archivedError = await archivedDocumentError(t, access.document);
  if (archivedError) return { ok: false, error: archivedError };
  if (
    isExternallyManagedSignatureProvider(access.document.signatureProvider) ||
    isExternallyManagedSignatureProvider(parsed.data.provider)
  ) {
    return {
      ok: false,
      error: t("docusealControlled"),
    };
  }
  if (access.document.signatureStatus === "signed" && parsed.data.status !== "signed") {
    return { ok: false, error: t("signedImmutable") };
  }
  // Marking a document "signed" outside DocuSeal is an attestation, not verified
  // evidence — require the manager to record how/when it was actually signed
  // so the status isn't just a trust-me flag.
  const attestationNote = parsed.data.attestationNote?.trim() || "";
  if (parsed.data.status === "signed" && attestationNote.length < 3) {
    return { ok: false, error: t("describeSignature") };
  }
  const manualAttestation =
    parsed.data.status === "signed"
      ? { manualSignedById: context.user.id, manualSignedAt: new Date(), manualSignatureNote: attestationNote }
      : { manualSignedById: null, manualSignedAt: null, manualSignatureNote: null };
  const signatureChange = await db.transaction(async (tx) => {
    await tx.update(documents).set({ signatureStatus: parsed.data.status, signatureProvider: parsed.data.provider ?? null, signatureEnvelopeId: parsed.data.envelopeId ?? null, signatureUrl: parsed.data.url ?? null, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null, ...manualAttestation }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)));
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: "document.signature_changed", metadata: { status: parsed.data.status, provider: parsed.data.provider ?? null, envelopeId: parsed.data.envelopeId ?? null, attestationNote: manualAttestation.manualSignatureNote } });
    const targetContext = await documentAutomationContext(tx, context.organization.id, input.documentId);
    const event = await persistDomainEvent(tx, {
      name: "document.signature_changed",
      workspaceId: context.organization.id,
      actorId: context.user.id,
      aggregateType: "document",
      aggregateId: input.documentId,
      payload: { document: { id: input.documentId }, ...targetContext, status: parsed.data.status, provider: parsed.data.provider ?? undefined, envelopeId: parsed.data.envelopeId ?? undefined },
    });
    return { event, targetContext };
  });
  await publishPersistedDomainEvents([signatureChange.event]);
  const { emitWebhookEvent } = await import("@/server/webhooks/emit");
  await emitWebhookEvent(context.organization.id, "document.signature_changed", {
    document: { id: input.documentId },
    ...signatureChange.targetContext,
    status: parsed.data.status,
    ...(parsed.data.provider ? { provider: parsed.data.provider } : {}),
    ...(parsed.data.envelopeId ? { envelopeId: parsed.data.envelopeId } : {}),
  }, { actorId: context.user.id, skipDomainEvent: true, eventId: signatureChange.event.eventId });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

/** Set or clear a document's business date (e.g. an NDA's expiration/effective date). */
export async function setDocumentExpiresAt(input: { documentId: string; expiresAt: string | null }): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = documentIdSchema.extend({ expiresAt: z.iso.date().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidDate") };
  const access = await resolveDocumentAccessInScope({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: t("cannotEditDocument") };
  const archivedError = await archivedDocumentError(t, access.document);
  if (archivedError) return { ok: false, error: archivedError };
  await db.transaction(async (tx) => {
    await tx.update(documents).set({ expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)));
    await logDocumentActivity(tx, { workspaceId: context.organization.id, actorId: context.user.id, documentId: input.documentId, type: "document.date_set", metadata: { expiresAt: parsed.data.expiresAt } });
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function createDocumentCategory(input: { name: string; accent?: string }): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: t("categoryNameRequired") };
  const slug = slugifyDocumentCategory(name);
  try {
    await db.insert(documentCategories).values({ workspaceId: context.organization.id, name, slug, accent: input.accent?.trim().slice(0, 30) || "pine" });
  } catch {
    return { ok: false, error: t("categoryNameTaken") };
  }
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function updateDocumentCategory(input: { categoryId: string; name: string; accent?: string; active: boolean }): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = z.object({ categoryId: z.uuid(), name: z.string().trim().min(1).max(80), accent: z.string().trim().max(30).optional(), active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidCategory") };
  await db.update(documentCategories).set({ name: parsed.data.name, slug: slugifyDocumentCategory(parsed.data.name), accent: parsed.data.accent || "pine", active: parsed.data.active }).where(and(eq(documentCategories.id, input.categoryId), eq(documentCategories.workspaceId, context.organization.id)));
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

const sendSignatureSchema = z.object({
  documentId: z.uuid(),
  recipientEmail: z.email(),
  recipientName: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().max(2000).optional(),
});

/**
 * Send a Documents-hub file for remote e-signature via DocuSeal. Creates a
 * `kind: "document"` submission, marks the document pending, and relies on the
 * DocuSeal webhook + reconciliation cron to flip the status to signed and
 * persist the combined signed PDF + audit log.
 */
export async function sendDocumentForSignature(input: {
  documentId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  message?: string | null;
}): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = sendSignatureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidRecipient") };
  const access = await resolveDocumentAccessInScope({
    documentId: input.documentId,
    workspaceId: context.organization.id,
    userId: context.user.id,
    roleKey: context.roleKey,
  });
  if (!access || access.level !== "manage") return { ok: false, error: t("cannotSendForSignature") };
  const archivedError = await archivedDocumentError(t, access.document);
  if (archivedError) return { ok: false, error: archivedError };

  const result = await sendDocumentForEnvelope({
    workspaceId: context.organization.id,
    documentId: input.documentId,
    actorId: context.user.id,
    recipientEmail: parsed.data.recipientEmail,
    recipientName: parsed.data.recipientName,
    subject: parsed.data.subject,
    message: parsed.data.message ?? null,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/dashboard/documents");
  return { ok: true, documentId: input.documentId };
}

/**
 * Void an in-flight DocuSeal signature request. Archives the submission and
 * marks the document declined immediately for UX; the reconciliation cron
 * confirms the terminal state out of band.
 */
export async function voidDocumentSignature(input: {
  documentId: string;
  reason: string;
}): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = z
    .object({ documentId: z.uuid(), reason: z.string().trim().min(3).max(400) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: t("voidReasonRequired") };
  const access = await resolveDocumentAccessInScope({
    documentId: input.documentId,
    workspaceId: context.organization.id,
    userId: context.user.id,
    roleKey: context.roleKey,
  });
  if (!access || access.level !== "manage") return { ok: false, error: t("cannotVoidRequest") };
  const archivedError = await archivedDocumentError(t, access.document);
  if (archivedError) return { ok: false, error: archivedError };
  const document = access.document;
  if (document.signatureProvider === "native") {
    if (document.signatureStatus !== "pending") {
      return { ok: false, error: t("nativeVoidNotPending") };
    }
    if (!document.signatureEnvelopeRefId) {
      return { ok: false, error: t("nativeEnvelopeMissing") };
    }
    const voided = await voidNativeSignature({
      workspaceId: context.organization.id,
      documentId: input.documentId,
      envelopeId: document.signatureEnvelopeRefId,
      actorId: context.user.id,
      actorName: context.user.name,
      reason: parsed.data.reason,
    });
    if (!voided.ok) return { ok: false, error: voided.error };
    revalidatePath("/dashboard/documents");
    return { ok: true };
  }
  if (!isExternallyManagedSignatureProvider(document.signatureProvider)) {
    return { ok: false, error: t("notVoidable") };
  }
  if (document.signatureStatus === "signed") {
    return { ok: false, error: t("signedCannotVoid") };
  }
  if (!document.signatureEnvelopeRefId && !document.signatureEnvelopeId) {
    return { ok: false, error: t("docusealSubmissionMissing") };
  }

  const ctx = await freshEsignContext(context.organization.id);
  if (!ctx) return { ok: false, error: t("docusealNotConnected") };

  // Resolve the provider submission id: prefer the stored envelope row, fall back
  // to the denormalised id on the document for envelopes created before the
  // refId was wired.
  let submissionId = document.signatureEnvelopeId;
  if (document.signatureEnvelopeRefId) {
    const [envelope] = await db
      .select({ providerEnvelopeId: signatureEnvelopes.providerEnvelopeId, status: signatureEnvelopes.status })
      .from(signatureEnvelopes)
      .where(and(eq(signatureEnvelopes.workspaceId, context.organization.id), eq(signatureEnvelopes.id, document.signatureEnvelopeRefId)))
      .limit(1);
    if (!envelope) return { ok: false, error: t("envelopeNotFound") };
    if (envelope.status === "completed" || envelope.status === "declined" || envelope.status === "voided") {
      return { ok: false, error: t("signatureAlreadyComplete") };
    }
    submissionId = envelope.providerEnvelopeId;
  }
  if (!submissionId) return { ok: false, error: t("docusealSubmissionIdMissing") };

  try {
    await archiveSubmission(ctx, submissionId);
  } catch (error) {
    log.error({ error, documentId: input.documentId }, "voidDocumentSignature: archiveSubmission failed");
    return {
      ok: false,
      error: error instanceof Error
        ? t("docusealVoidFailedWithReason", { reason: error.message })
        : t("docusealVoidFailed"),
    };
  }

  const signatureChange = await db.transaction(async (tx) => {
    await tx
      .update(documents)
      .set({ signatureStatus: "declined", updatedAt: new Date() })
      .where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, context.organization.id)));
    await logDocumentActivity(tx, {
      workspaceId: context.organization.id,
      actorId: context.user.id,
      documentId: input.documentId,
      type: "document.signature_voided",
      metadata: { provider: "docuseal", submissionId, reason: parsed.data.reason },
    });
    const targetContext = await documentAutomationContext(tx, context.organization.id, input.documentId);
    const event = await persistDomainEvent(tx, {
      name: "document.signature_voided",
      workspaceId: context.organization.id,
      actorId: context.user.id,
      aggregateType: "document",
      aggregateId: input.documentId,
      payload: { document: { id: input.documentId }, ...targetContext, status: "declined", provider: "docuseal", envelopeId: submissionId, reason: parsed.data.reason },
    });
    return { event, targetContext };
  });
  await publishPersistedDomainEvents([signatureChange.event]);
  const { emitWebhookEvent } = await import("@/server/webhooks/emit");
  await emitWebhookEvent(context.organization.id, "document.signature_voided", {
    document: { id: input.documentId },
    ...signatureChange.targetContext,
    status: "declined",
    provider: "docuseal",
    envelopeId: submissionId,
    reason: parsed.data.reason,
  }, { actorId: context.user.id, skipDomainEvent: true, eventId: signatureChange.event.eventId });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

const bulkIdsSchema = z.object({ documentIds: z.array(z.uuid()).min(1).max(200) });

/** Resolve ACL for every id; return the subset the caller can manage. */
async function resolveManageableIds(
  workspaceId: string,
  userId: string,
  roleKey: string,
  documentIds: string[],
  activeOnly = false,
): Promise<string[]> {
  const accessible: string[] = [];
  for (const documentId of documentIds) {
    const access = await resolveDocumentAccessInScope({ documentId, workspaceId, userId, roleKey });
    if (access?.level === "manage" && (!activeOnly || access.document.status === "active")) accessible.push(documentId);
  }
  return accessible;
}

/** Archive or restore many documents at once. Skips ids under legal hold. */
export async function bulkSetDocumentStatus(input: {
  documentIds: string[];
  status: "active" | "archived";
}): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = bulkIdsSchema.extend({ status: z.enum(["active", "archived"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidBulkStatus") };
  const ids = await resolveManageableIds(context.organization.id, context.user.id, context.roleKey, parsed.data.documentIds);
  if (ids.length === 0) return { ok: false, error: t("cannotManageSelected") };

  if (parsed.data.status === "archived") {
    const held = await db
      .select({ documentId: documentLegalHolds.documentId })
      .from(documentLegalHolds)
      .where(
        and(
          eq(documentLegalHolds.workspaceId, context.organization.id),
          inArray(documentLegalHolds.documentId, ids),
          isNull(documentLegalHolds.releasedAt),
        ),
      );
    const heldIds = new Set(held.map((row) => row.documentId));
    const archivable = ids.filter((id) => !heldIds.has(id));
    if (archivable.length === 0) {
      return { ok: false, error: t("allHeldCannotArchive") };
    }
    await db.transaction(async (tx) => {
      await tx.update(documents).set({ status: "archived" }).where(and(eq(documents.workspaceId, context.organization.id), inArray(documents.id, archivable)));
      await tx.insert(activityEvents).values(archivable.map((documentId) => ({ workspaceId: context.organization.id, actorId: context.user.id, entityType: "document" as const, entityId: documentId, type: "document.archived", metadata: { bulk: true } })));
    });
    revalidatePath("/dashboard/documents");
    if (heldIds.size > 0) {
      return { ok: true, error: t("bulkArchivedSkipped", { archived: archivable.length, held: heldIds.size }) };
    }
    return { ok: true };
  }

  await db.transaction(async (tx) => {
    await tx.update(documents).set({ status: "active" }).where(and(eq(documents.workspaceId, context.organization.id), inArray(documents.id, ids)));
    await tx.insert(activityEvents).values(ids.map((documentId) => ({ workspaceId: context.organization.id, actorId: context.user.id, entityType: "document" as const, entityId: documentId, type: "document.restored", metadata: { bulk: true } })));
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

/** Assign the same category to many documents at once. */
export async function bulkSetDocumentCategory(input: {
  documentIds: string[];
  categoryId: string | null;
}): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const parsed = bulkIdsSchema.extend({ categoryId: z.uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidBulkCategory") };
  if (parsed.data.categoryId) {
    const [category] = await db.select({ id: documentCategories.id }).from(documentCategories).where(and(eq(documentCategories.id, parsed.data.categoryId), eq(documentCategories.workspaceId, context.organization.id), eq(documentCategories.active, true))).limit(1);
    if (!category) return { ok: false, error: t("categoryNotFound") };
  }
  const ids = await resolveManageableIds(context.organization.id, context.user.id, context.roleKey, parsed.data.documentIds, true);
  if (ids.length === 0) return { ok: false, error: t("cannotManageSelected") };
  await db.transaction(async (tx) => {
    await tx.update(documents).set({ categoryId: parsed.data.categoryId }).where(and(eq(documents.workspaceId, context.organization.id), inArray(documents.id, ids)));
    await tx.insert(activityEvents).values(ids.map((documentId) => ({ workspaceId: context.organization.id, actorId: context.user.id, entityType: "document" as const, entityId: documentId, type: "document.category_changed", metadata: { categoryId: parsed.data.categoryId, bulk: true } })));
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

/** Permanently delete many documents at once. Owner/admin only; skips pending-signature and legal-hold ids. */
export async function bulkDeleteDocuments(input: { documentIds: string[] }): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const denied = await requireOwnerOrAdminResult(t("ownerOrAdminOnlyDelete"));
  if (denied) return denied;
  const { context } = permission;
  const parsed = bulkIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidBulkDelete") };

  const held = await db
    .select({ documentId: documentLegalHolds.documentId })
    .from(documentLegalHolds)
    .where(and(eq(documentLegalHolds.workspaceId, context.organization.id), inArray(documentLegalHolds.documentId, parsed.data.documentIds), isNull(documentLegalHolds.releasedAt)));
  const heldIds = new Set(held.map((row) => row.documentId));

  const candidates = await db
    .select({ id: documents.id, storageKey: documents.storageKey, name: documents.name, signatureStatus: documents.signatureStatus })
    .from(documents)
    .where(and(eq(documents.workspaceId, context.organization.id), inArray(documents.id, parsed.data.documentIds)));

  const deletable: typeof candidates = [];
  let skippedPending = 0;
  for (const doc of candidates) {
    if (heldIds.has(doc.id)) continue;
    if (doc.signatureStatus === "pending") {
      skippedPending += 1;
      continue;
    }
    const access = await resolveDocumentAccessInScope({ documentId: doc.id, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
    if (access?.level === "manage") deletable.push(doc);
  }
  if (deletable.length === 0) {
    return { ok: false, error: t("noneDeletable") };
  }

  const ids = deletable.map((doc) => doc.id);
  const [versions, artifacts] = await Promise.all([
    db.select({ storageKey: documentVersions.storageKey }).from(documentVersions).where(inArray(documentVersions.documentId, ids)),
    db.select({ storageKey: signatureArtifacts.storageKey }).from(signatureArtifacts).where(and(eq(signatureArtifacts.workspaceId, context.organization.id), inArray(signatureArtifacts.documentId, ids))),
  ]);
  const storageKeys = [...new Set([...deletable.map((doc) => doc.storageKey), ...versions.map((row) => row.storageKey), ...artifacts.map((row) => row.storageKey)])];

  await db.transaction(async (tx) => {
    await tx.delete(signatureArtifacts).where(and(eq(signatureArtifacts.workspaceId, context.organization.id), inArray(signatureArtifacts.documentId, ids)));
    await tx.insert(activityEvents).values(ids.map((documentId) => ({ workspaceId: context.organization.id, actorId: context.user.id, entityType: "document" as const, entityId: documentId, type: "document.deleted", metadata: { bulk: true } })));
    await tx.delete(documents).where(and(eq(documents.workspaceId, context.organization.id), inArray(documents.id, ids)));
  });

  const deletions = await Promise.allSettled(storageKeys.map((key) => storage.delete(key)));
  const failed = deletions.filter((result) => result.status === "rejected").length;
  if (failed > 0) log.warn({ failed, total: storageKeys.length }, "Some document storage objects could not be deleted during bulk delete");

  revalidatePath("/dashboard/documents");
  const skipped = candidates.length - deletable.length;
  if (skipped > 0) {
    return { ok: true, error: skippedPending > 0
        ? t("bulkDeletedSkippedHoldOrPending", { deleted: deletable.length, skipped })
        : t("bulkDeletedSkippedHold", { deleted: deletable.length, skipped }) };
  }
  return { ok: true };
}


/* ── Signer actions (native links) ──────────────────────────────────────── */

type SignerTarget = {
  workspaceId: string;
  documentName: string;
  envelopeId: string;
  recipient: { id: string; email: string; name: string; linkExpiresAt: Date };
};

/** A native signer whose link is live: the only kind a reminder or fresh link can serve. */
async function resolveLiveNativeSigner(
  context: DocumentPermissionContext["context"],
  input: { documentId: string; recipientId: string },
  t: ActionT,
): Promise<SignerTarget | { error: string }> {
  const parsed = z.object({ documentId: z.uuid(), recipientId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: t("invalidSigner") };
  const access = await resolveDocumentAccessInScope({ documentId: input.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { error: t("cannotManageDocument") };
  const archivedError = await archivedDocumentError(t, access.document);
  if (archivedError) return { error: archivedError };
  const document = access.document;
  if (document.signatureProvider !== "native" || document.signatureStatus !== "pending" || !document.signatureEnvelopeRefId) {
    return { error: t("noNativeSigningRequest") };
  }
  const [recipient] = await db
    .select({ id: signatureRecipients.id, email: signatureRecipients.email, name: signatureRecipients.name, status: signatureRecipients.status, linkExpiresAt: signatureRecipients.linkExpiresAt })
    .from(signatureRecipients)
    .where(and(
      eq(signatureRecipients.id, input.recipientId),
      eq(signatureRecipients.workspaceId, context.organization.id),
      eq(signatureRecipients.envelopeId, document.signatureEnvelopeRefId),
      eq(signatureRecipients.role, "signer"),
    ))
    .limit(1);
  if (!recipient) return { error: t("signerNotFound") };
  if (recipient.status !== "sent") return { error: t("signerNotCurrent") };
  if (!recipient.linkExpiresAt || recipient.linkExpiresAt <= new Date()) {
    return { error: t("signingLinkExpired") };
  }
  return {
    workspaceId: context.organization.id,
    documentName: document.name,
    envelopeId: document.signatureEnvelopeRefId,
    recipient: { id: recipient.id, email: recipient.email, name: recipient.name, linkExpiresAt: recipient.linkExpiresAt },
  };
}

/**
 * Email the current signer a fresh link right now. Links are stored hashed, so
 * a reminder replaces the previous link (the same rule the daily cron follows).
 * Limited to one reminder per signer per minute by the event key.
 */
export async function remindSignatureRecipient(input: { documentId: string; recipientId: string }): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const target = await resolveLiveNativeSigner(context, input, t);
  if ("error" in target) return { ok: false, error: target.error };

  // Shared with the scheduled reminders: same throttle and cap, and earlier
  // links keep working (old token hashes are kept), unlike a link rotation.
  const reminded = await remindNativeSigner({
    workspaceId: target.workspaceId,
    documentId: input.documentId,
    actorId: context.user.id,
    recipientId: target.recipient.id,
  });
  if (!reminded.ok) return { ok: false, error: reminded.error };
  await db.transaction((tx) =>
    logDocumentActivity(tx, { workspaceId: target.workspaceId, actorId: context.user.id, documentId: input.documentId, type: "document.signature_reminded", metadata: { recipientId: target.recipient.id } }),
  );
  revalidatePath(`/dashboard/documents/${input.documentId}`);
  return { ok: true };
}

/**
 * A fresh signing URL to hand over by other means. Issuing one replaces the
 * link the signer was emailed (only hashes are stored), so callers confirm first.
 */
export async function createSignatureShareLink(input: { documentId: string; recipientId: string }): Promise<{ ok: boolean; error?: string; url?: string }> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const target = await resolveLiveNativeSigner(context, input, t);
  if ("error" in target) return { ok: false, error: target.error };
  const rotated = await rotateNativePortalSigningLink({ workspaceId: target.workspaceId, recipientId: target.recipient.id });
  if (!rotated.ok) return { ok: false, error: rotated.error };
  await db.insert(activityEvents).values({
    workspaceId: target.workspaceId,
    actorId: context.user.id,
    entityType: "document",
    entityId: input.documentId,
    type: "document.signature_link_copied",
    metadata: { recipientId: target.recipient.id },
  });
  revalidatePath(`/dashboard/documents/${input.documentId}`);
  return { ok: true, url: rotated.signingUrl };
}

/* ── Generate a document from a template ────────────────────────────────── */

export async function getGenerateDocumentOptions(): Promise<{ ok: boolean; error?: string; templates: GenerateTemplateOption[] }> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error, templates: [] };
  const templates = await listActiveWorkflowDocumentTemplates();
  return { ok: true, templates: templates.map((template) => ({ id: template.id, name: template.name, title: template.title })) };
}

/** Applications the caller can see, by candidate or job name, or all of one candidate's. */
export async function searchGenerateDocumentTargets(input: { query?: string; candidateId?: string }): Promise<{ ok: boolean; error?: string; targets: GenerateTargetOption[] }> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error, targets: [] };
  const { context } = permission;
  const parsed = z.object({ query: z.string().trim().max(80).optional(), candidateId: z.uuid().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidSearch"), targets: [] };
  const policy = await getRolePolicy(context.organization.id, context.roleKey);
  const actor = { workspaceId: context.organization.id, userId: context.user.id, permissions: policy.permissions, scope: policy.scope };
  const needle = parsed.data.query ? `%${parsed.data.query.replace(/[%_\\]/g, "\\$&")}%` : null;
  const rows = await db
    .select({
      applicationId: applications.id,
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      jobTitle: jobs.title,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(
      eq(applications.workspaceId, context.organization.id),
      isNull(candidates.deletedAt),
      isNull(jobs.deletedAt),
      candidateScopeSql(actor, candidates.id),
      jobScopeSql(actor),
      parsed.data.candidateId ? eq(candidates.id, parsed.data.candidateId) : undefined,
      needle ? or(ilike(candidates.firstName, needle), ilike(candidates.lastName, needle), ilike(jobs.title, needle)) : undefined,
    ))
    .orderBy(desc(applications.appliedAt))
    .limit(15);
  return {
    ok: true,
    targets: rows.map((row) => ({
      applicationId: row.applicationId,
      candidateId: row.candidateId,
      candidateName: `${row.firstName} ${row.lastName}`.trim(),
      jobTitle: row.jobTitle,
    })),
  };
}

async function authorizeGenerateTarget(context: DocumentPermissionContext["context"], applicationId: string, t: ActionT) {
  const target = { targetType: "application" as const, targetId: applicationId };
  if (!z.uuid().safeParse(applicationId).success || !(await targetBelongsToWorkspace(context.organization.id, target))) {
    return t("applicationNotFound");
  }
  const inScope = await associationTargetsInScope({ workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey }, [target]);
  return inScope ? null : t("applicationNotFound");
}

/** Fill the template for one application without saving anything. */
export async function previewTemplateDocument(input: { templateId: string; applicationId: string }): Promise<{ ok: boolean; error?: string; title?: string; html?: string; blank?: string[] }> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const denied = await authorizeGenerateTarget(context, input.applicationId, t);
  if (denied) return { ok: false, error: denied };
  if (!z.uuid().safeParse(input.templateId).success) return { ok: false, error: t("chooseTemplate") };
  const rendered = await renderTemplateForApplication({ workspaceId: context.organization.id, actorId: context.user.id, templateId: input.templateId, applicationId: input.applicationId });
  if (!rendered.ok) return { ok: false, error: rendered.error };
  return { ok: true, title: rendered.title, html: rendered.body, blank: rendered.blank };
}

/**
 * Generate the PDF for one candidate application and save it to the library,
 * linked to the application and its candidate. Each click makes a new document.
 */
export async function generateDocumentFromTemplate(input: { templateId: string; applicationId: string }): Promise<DocumentActionResult> {
  const t = await getTranslations("server.documents.actions");
  const permission = await documentContext(t, "documents:manage");
  if (permission.error) return { ok: false, error: permission.error };
  const { context } = permission;
  const denied = await authorizeGenerateTarget(context, input.applicationId, t);
  if (denied) return { ok: false, error: denied };
  if (!z.uuid().safeParse(input.templateId).success) return { ok: false, error: t("chooseTemplate") };
  const rendered = await renderTemplateForApplication({ workspaceId: context.organization.id, actorId: context.user.id, templateId: input.templateId, applicationId: input.applicationId });
  if (!rendered.ok) return { ok: false, error: rendered.error };
  const result = await generateDocumentForWorkflow({
    workspaceId: context.organization.id,
    actorUserId: context.user.id,
    applicationId: input.applicationId,
    title: rendered.title,
    body: rendered.body,
    effectKey: `manual:${randomUUID()}`,
  }).catch((error: unknown) => {
    log.error({ error }, "generateDocumentFromTemplate failed");
    return null;
  });
  if (!result) return { ok: false, error: t("generateFailed") };
  if (!result.ok) return { ok: false, error: result.error };
  // The workflow generator links the application; also link the candidate so the
  // candidate filter and profile find it.
  await db.insert(documentAssociations).values({
    workspaceId: context.organization.id,
    documentId: result.documentId,
    targetType: "candidate",
    targetId: result.candidateId,
    createdById: context.user.id,
  });
  await db.insert(activityEvents).values({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    entityType: "document",
    entityId: result.documentId,
    type: "document.generated",
    metadata: { source: "manual", templateName: rendered.templateName, applicationId: input.applicationId },
  });
  revalidatePath("/dashboard/documents");
  revalidatePath(`/dashboard/candidates/${result.candidateId}`);
  return { ok: true, documentId: result.documentId };
}
