import "server-only";

import { createHash } from "node:crypto";

import { and, eq, isNull, or } from "drizzle-orm";

import {
  activityEvents,
  db,
  documentAssociations,
  documentVersions,
  documents,
  offers,
  signatureArtifacts,
} from "@harly/db";

import {
  downloadDocusealFile,
  freshEsignContext,
  getDocusealSubmissionUrl,
  getSubmission,
  getSubmissionDocuments,
  type EsignConfigLike,
} from "@/lib/esign/client";
import { createLogger } from "@/lib/logger";
import { createDocumentStorageKey } from "@/lib/storage-validation";
import { storage } from "@/lib/storage";

const log = createLogger("esign-signed-artifact");

/**
 * Resolve the combined signed PDF URL for a completed submission. Prefer the
 * `combined_document_url` on the submission; fall back to the merged documents
 * endpoint. Also returns the audit log URL when present.
 */
async function resolveSignedUrls(
  ctx: EsignConfigLike,
  submissionId: string,
): Promise<{ combinedUrl: string; auditUrl: string | null }> {
  const submission = await getSubmission(ctx, submissionId);
  let combinedUrl = submission.combined_document_url ?? null;
  const auditUrl = submission.audit_log_url ?? null;
  if (!combinedUrl) {
    const docs = await getSubmissionDocuments(ctx, submissionId, true);
    combinedUrl = docs.documents[0]?.url ?? null;
  }
  if (!combinedUrl) {
    throw new Error("DocuSeal returned no signed document URL.");
  }
  return { combinedUrl, auditUrl };
}

/**
 * Download the completed submission and create one immutable signed artifact in
 * the Documents hub. The submission id makes this idempotent for both webhook
 * retries and reconciliation runs.
 */
export async function persistSignedDocumentForEnvelope(
  workspaceId: string,
  submissionId: string,
  signatureEnvelopeId: string,
  source: "webhook" | "reconciliation" = "webhook",
): Promise<string | null> {
  const [existing] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        or(
          eq(documents.signatureEnvelopeRefId, signatureEnvelopeId),
          and(
            isNull(documents.signatureEnvelopeRefId),
            eq(documents.signatureEnvelopeId, submissionId),
          ),
        ),
        eq(documents.signatureStatus, "signed"),
        eq(documents.originalName, "Offer signed.pdf"),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  let [offer] = await db
    .select({
      id: offers.id,
      candidateId: offers.candidateId,
      createdById: offers.createdById,
      title: offers.title,
    })
    .from(offers)
    .where(
      and(
        eq(offers.workspaceId, workspaceId),
        eq(offers.signatureEnvelopeRefId, signatureEnvelopeId),
      ),
    )
    .limit(1);
  if (!offer) {
    [offer] = await db
      .select({
        id: offers.id,
        candidateId: offers.candidateId,
        createdById: offers.createdById,
        title: offers.title,
      })
      .from(offers)
      .where(
        and(
          eq(offers.workspaceId, workspaceId),
          eq(offers.esignSubmissionId, submissionId),
        ),
      )
      .limit(1);
  }
  if (!offer) {
    return persistSignedDocumentForDocumentEnvelope(
      workspaceId,
      submissionId,
      signatureEnvelopeId,
      source,
    );
  }

  const ctx = await freshEsignContext(workspaceId);
  if (!ctx) throw new Error("DocuSeal connection is unavailable.");
  const { combinedUrl, auditUrl } = await resolveSignedUrls(ctx, submissionId);
  const bytes = await downloadDocusealFile(ctx, combinedUrl);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storageKey = createDocumentStorageKey(workspaceId, "Offer signed.pdf");
  await storage.put(storageKey, bytes, "application/pdf");

  let certificateBytes: Buffer | null = null;
  if (auditUrl) {
    try {
      certificateBytes = await downloadDocusealFile(ctx, auditUrl);
    } catch (error) {
      log.warn({ error, submissionId }, "docuseal audit log unavailable");
    }
  }
  const certificateChecksum = certificateBytes
    ? createHash("sha256").update(certificateBytes).digest("hex")
    : null;
  const certificateStorageKey = certificateBytes
    ? createDocumentStorageKey(workspaceId, "Signature certificate.pdf")
    : null;
  if (certificateBytes && certificateStorageKey) {
    await storage.put(certificateStorageKey, certificateBytes, "application/pdf");
  }

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(documents)
      .values({
        workspaceId,
        name: "Offer signed — " + offer.title,
        originalName: "Offer signed.pdf",
        mimeType: "application/pdf",
        sizeBytes: bytes.byteLength,
        checksum,
        storageKey,
        status: "active",
        signatureStatus: "signed",
        signatureProvider: "docuseal",
        signatureEnvelopeId: submissionId,
        signatureEnvelopeRefId: signatureEnvelopeId,
        signatureUrl: getDocusealSubmissionUrl(ctx.baseUrl, submissionId),
        ownerId: offer.createdById,
        createdById: offer.createdById,
      })
      .returning({ id: documents.id });
    if (!created) throw new Error("Signed document could not be saved.");

    const [version] = await tx
      .insert(documentVersions)
      .values({
        workspaceId,
        documentId: created.id,
        versionNumber: 1,
        storageKey,
        sizeBytes: bytes.byteLength,
        checksum,
        uploadedById: offer.createdById,
      })
      .returning({ id: documentVersions.id });
    await tx.insert(signatureArtifacts).values({
      workspaceId,
      envelopeId: signatureEnvelopeId,
      documentId: created.id,
      documentVersionId: version?.id ?? null,
      kind: "signed_document",
      storageKey,
      mimeType: "application/pdf",
      sizeBytes: bytes.byteLength,
      checksum,
    });
    if (certificateBytes && certificateStorageKey && certificateChecksum) {
      await tx.insert(signatureArtifacts).values({
        workspaceId,
        envelopeId: signatureEnvelopeId,
        documentId: null,
        documentVersionId: null,
        kind: "completion_certificate",
        storageKey: certificateStorageKey,
        mimeType: "application/pdf",
        sizeBytes: certificateBytes.byteLength,
        checksum: certificateChecksum,
      });
    }
    await tx.insert(documentAssociations).values([
      {
        workspaceId,
        documentId: created.id,
        targetType: "offer",
        targetId: offer.id,
        createdById: offer.createdById,
      },
      {
        workspaceId,
        documentId: created.id,
        targetType: "candidate",
        targetId: offer.candidateId,
        createdById: offer.createdById,
      },
    ]);
    await tx.insert(activityEvents).values({
      workspaceId,
      actorId: offer.createdById,
      entityType: "document",
      entityId: created.id,
      type: "document.uploaded",
      metadata: {
        provider: "docuseal",
        submissionId,
        signatureEnvelopeId,
        signatureStatus: "signed",
        source,
        hasCompletionCertificate: Boolean(certificateBytes),
      },
    });
    return created.id;
  });
}

/**
 * Document-kind counterpart. When a submission was created from the Documents
 * hub (no offer), download the combined signed PDF + audit log and create one
 * immutable signed document that inherits the source document's associations.
 * Idempotent on the signature_artifacts table (envelopeId, kind).
 */
async function persistSignedDocumentForDocumentEnvelope(
  workspaceId: string,
  submissionId: string,
  signatureEnvelopeId: string,
  source: "webhook" | "reconciliation" = "webhook",
): Promise<string | null> {
  const [existingArtifact] = await db
    .select({ documentId: signatureArtifacts.documentId })
    .from(signatureArtifacts)
    .where(
      and(
        eq(signatureArtifacts.workspaceId, workspaceId),
        eq(signatureArtifacts.envelopeId, signatureEnvelopeId),
        eq(signatureArtifacts.kind, "signed_document"),
      ),
    )
    .limit(1);
  if (existingArtifact?.documentId) return existingArtifact.documentId;

  const [sourceDoc] = await db
    .select({
      id: documents.id,
      name: documents.name,
      originalName: documents.originalName,
      ownerId: documents.ownerId,
      createdById: documents.createdById,
    })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.signatureEnvelopeRefId, signatureEnvelopeId),
      ),
    )
    .limit(1);
  let sourceDocument = sourceDoc;
  if (!sourceDocument) {
    const [byEnvelopeId] = await db
      .select({
        id: documents.id,
        name: documents.name,
        originalName: documents.originalName,
        ownerId: documents.ownerId,
        createdById: documents.createdById,
      })
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          eq(documents.signatureEnvelopeId, submissionId),
          eq(documents.signatureProvider, "docuseal"),
        ),
      )
      .limit(1);
    sourceDocument = byEnvelopeId;
  }
  if (!sourceDocument) return null;

  const ctx = await freshEsignContext(workspaceId);
  if (!ctx) throw new Error("DocuSeal connection is unavailable.");
  const { combinedUrl, auditUrl } = await resolveSignedUrls(ctx, submissionId);
  const bytes = await downloadDocusealFile(ctx, combinedUrl);
  const checksum = createHash("sha256").update(bytes).digest("hex");

  const baseName = (sourceDocument.originalName.replace(/\.[^.]+$/, "") || sourceDocument.name).slice(0, 180);
  const signedOriginalName = `${baseName} — signed.pdf`;
  const storageKey = createDocumentStorageKey(workspaceId, signedOriginalName);
  await storage.put(storageKey, bytes, "application/pdf");

  let certificateBytes: Buffer | null = null;
  if (auditUrl) {
    try {
      certificateBytes = await downloadDocusealFile(ctx, auditUrl);
    } catch (error) {
      log.warn({ error, submissionId }, "docuseal audit log unavailable");
    }
  }
  const certificateChecksum = certificateBytes
    ? createHash("sha256").update(certificateBytes).digest("hex")
    : null;
  const certificateStorageKey = certificateBytes
    ? createDocumentStorageKey(workspaceId, "Signature certificate.pdf")
    : null;
  if (certificateBytes && certificateStorageKey) {
    await storage.put(certificateStorageKey, certificateBytes, "application/pdf");
  }

  const sourceAssociationRows = await db
    .select({ targetType: documentAssociations.targetType, targetId: documentAssociations.targetId })
    .from(documentAssociations)
    .where(
      and(
        eq(documentAssociations.workspaceId, workspaceId),
        eq(documentAssociations.documentId, sourceDocument.id),
      ),
    );

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(documents)
      .values({
        workspaceId,
        name: `${sourceDocument.name} — signed`.slice(0, 255),
        originalName: signedOriginalName,
        mimeType: "application/pdf",
        sizeBytes: bytes.byteLength,
        checksum,
        storageKey,
        status: "active",
        signatureStatus: "signed",
        signatureProvider: "docuseal",
        signatureEnvelopeId: submissionId,
        signatureEnvelopeRefId: signatureEnvelopeId,
        signatureUrl: getDocusealSubmissionUrl(ctx.baseUrl, submissionId),
        ownerId: sourceDocument.ownerId,
        createdById: sourceDocument.createdById,
      })
      .returning({ id: documents.id });
    if (!created) throw new Error("Signed document could not be saved.");

    const [version] = await tx
      .insert(documentVersions)
      .values({
        workspaceId,
        documentId: created.id,
        versionNumber: 1,
        storageKey,
        sizeBytes: bytes.byteLength,
        checksum,
        uploadedById: sourceDocument.createdById,
      })
      .returning({ id: documentVersions.id });
    await tx.insert(signatureArtifacts).values({
      workspaceId,
      envelopeId: signatureEnvelopeId,
      documentId: created.id,
      documentVersionId: version?.id ?? null,
      kind: "signed_document",
      storageKey,
      mimeType: "application/pdf",
      sizeBytes: bytes.byteLength,
      checksum,
    });
    if (certificateBytes && certificateStorageKey && certificateChecksum) {
      await tx.insert(signatureArtifacts).values({
        workspaceId,
        envelopeId: signatureEnvelopeId,
        documentId: null,
        documentVersionId: null,
        kind: "completion_certificate",
        storageKey: certificateStorageKey,
        mimeType: "application/pdf",
        sizeBytes: certificateBytes.byteLength,
        checksum: certificateChecksum,
      });
    }

    const associations = (sourceAssociationRows.length > 0
      ? sourceAssociationRows
      : [{ targetType: "workspace", targetId: null }]
    ).map((row) => ({
      workspaceId,
      documentId: created.id,
      targetType: row.targetType,
      targetId: row.targetId,
      createdById: sourceDocument.createdById,
    }));
    await tx.insert(documentAssociations).values(associations);

    await tx.insert(activityEvents).values({
      workspaceId,
      actorId: sourceDocument.createdById,
      entityType: "document",
      entityId: created.id,
      type: "document.uploaded",
      metadata: {
        provider: "docuseal",
        submissionId,
        signatureEnvelopeId,
        signatureStatus: "signed",
        source,
        sourceDocumentId: sourceDocument.id,
        hasCompletionCertificate: Boolean(certificateBytes),
      },
    });
    return created.id;
  });
}
