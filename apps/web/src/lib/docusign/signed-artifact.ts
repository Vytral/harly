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
  freshDocuSignContext,
  getDocuSignEnvelopeUrl,
  getEnvelopeDocument,
} from "@/lib/docusign/client";
import { createLogger } from "@/lib/logger";
import { createDocumentStorageKey } from "@/lib/storage-validation";
import { storage } from "@/lib/storage";

const log = createLogger("docusign-signed-artifact");

/**
 * Download the completed envelope and create one immutable signed artifact in
 * the Documents hub. The normalized envelope id makes this operation
 * idempotent for both Connect retries and reconciliation runs.
 */
export async function persistSignedDocumentForEnvelope(
  workspaceId: string,
  envelopeId: string,
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
            eq(documents.signatureEnvelopeId, envelopeId),
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
          eq(offers.docusignEnvelopeId, envelopeId),
        ),
      )
      .limit(1);
  }
  if (!offer) return null;

  const ctx = await freshDocuSignContext(workspaceId);
  if (!ctx) throw new Error("DocuSign connection is unavailable.");
  const response = await getEnvelopeDocument(
    ctx.baseUrl,
    ctx.accessToken,
    ctx.accountId,
    envelopeId,
    "combined",
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storageKey = createDocumentStorageKey(workspaceId, "Offer signed.pdf");
  await storage.put(storageKey, bytes, "application/pdf");

  let certificateBytes: Buffer | null = null;
  try {
    const certificateResponse = await getEnvelopeDocument(
      ctx.baseUrl,
      ctx.accessToken,
      ctx.accountId,
      envelopeId,
      "certificate",
    );
    certificateBytes = Buffer.from(await certificateResponse.arrayBuffer());
  } catch (error) {
    log.warn(
      { error, envelopeId },
      "docusign completion certificate unavailable",
    );
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
        signatureProvider: "docusign",
        signatureEnvelopeId: envelopeId,
        signatureEnvelopeRefId: signatureEnvelopeId,
        signatureUrl: getDocuSignEnvelopeUrl(ctx.baseUrl, envelopeId),
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
        provider: "docusign",
        envelopeId,
        signatureEnvelopeId,
        signatureStatus: "signed",
        source,
        hasCompletionCertificate: Boolean(certificateBytes),
      },
    });
    return created.id;
  });
}
