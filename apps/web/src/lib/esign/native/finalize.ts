import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import {
  activityEvents,
  applications,
  applicationStageHistory,
  db,
  documentVersions,
  documents,
  jobStages,
  offers,
  signatureArtifacts,
  signatureEnvelopes,
  signatureEvidenceEvents,
  signatureRecipients,
} from "@harly/db";

import { bakeFieldsIntoPdf, type FieldPlacement, type SignaturePlacement } from "./bake";
import { createCompletionCertificate, NATIVE_CERTIFICATE_VERSION } from "./certificate";
import { createSignaturePreview } from "./preview";
import { storage } from "@/lib/storage";
import { createLogger } from "@/lib/logger";
import { persistDomainEvent, type PersistedDomainEvent } from "@/server/events/emit";
import { isNativeOfferAcceptanceAvailable } from "./fields";
import {
  purgeExpiredSignatureData,
  SIGNATURE_EVIDENCE_RETENTION_MS,
} from "@/lib/esign/maintenance";

const log = createLogger("native-finalize");

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Shape of one entry in documents.fieldsSnapshot — the frozen layout a
 *  recruiter placed at send time (see the schema comment on that column). */
type SnapshotField = {
  id: string;
  type: "signature" | "text";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string | null;
  required: boolean;
  order: number;
};

function sha256(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex"); }
function key(workspaceId: string, kind: string, extension: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) throw new Error("Invalid workspace storage namespace.");
  return `workspaces/${workspaceId}/signatures/${kind}/${randomUUID()}.${extension}`;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
}
async function evidence(tx: Tx, input: { workspaceId: string; envelopeId: string; recipientId: string; eventType: string; payload: Record<string, unknown> }) {
  const [previous] = await tx.select({ hash: signatureEvidenceEvents.currentHash }).from(signatureEvidenceEvents).where(and(eq(signatureEvidenceEvents.workspaceId, input.workspaceId), eq(signatureEvidenceEvents.envelopeId, input.envelopeId))).orderBy(desc(signatureEvidenceEvents.occurredAt), desc(signatureEvidenceEvents.id)).limit(1);
  const occurredAt = new Date();
  const payload = canonical(input.payload) as Record<string, unknown>;
  const currentHash = sha256(Buffer.from(JSON.stringify({ previousHash: previous?.hash ?? null, timestamp: occurredAt.toISOString(), envelopeId: input.envelopeId, recipientId: input.recipientId, eventType: input.eventType, payload })));
  await tx.insert(signatureEvidenceEvents).values({ workspaceId: input.workspaceId, envelopeId: input.envelopeId, recipientId: input.recipientId, eventType: input.eventType, occurredAt, payload, previousHash: previous?.hash ?? null, currentHash, retentionExpiresAt: new Date(occurredAt.getTime() + SIGNATURE_EVIDENCE_RETENTION_MS) });
}

/**
 * Resolve the FieldPlacement[] to bake, server-side.
 *
 * If the document has a frozen fieldsSnapshot (recruiter placed fields before
 * sending — see documents.fieldsSnapshot / signatureFields in schema.ts),
 * that snapshot is the ONLY source of geometry. The caller only supplies
 * CONTENT: one shared signature image for every "signature"-type field, and
 * a per-field `value` (keyed by the field's own id) for every "text"-type
 * field. Every submitted textValues key is validated against THIS
 * document's own snapshot — an id that doesn't resolve there (foreign
 * document, typo, tampering) is rejected outright, not silently ignored.
 *
 * If there is no snapshot, this is either genuinely legacy data or a
 * document sent in the deliberate gap between the schema migration and the
 * recruiter placement UI shipping (see the project plan) — fall back to the
 * caller's free-placement `placements`, logged so post-rollout fallback
 * hits are visible as bugs rather than silent.
 */
function resolveFields(input: {
  documentId: string;
  fieldsSnapshot: unknown;
  signaturePngBytes: Buffer | null;
  textValues: Record<string, string> | undefined;
  legacyPlacements: SignaturePlacement[] | undefined;
  requireFrozenFields?: boolean;
}): FieldPlacement[] {
  const snapshot = Array.isArray(input.fieldsSnapshot) ? (input.fieldsSnapshot as SnapshotField[]) : null;

  if (!snapshot || snapshot.length === 0) {
    if (input.requireFrozenFields) {
      throw new Error("The offer does not have a frozen signature field layout.");
    }
    log.info({ documentId: input.documentId }, "finalizeNativeSignature: no fieldsSnapshot, using legacy free-placement fallback");
    if (!input.legacyPlacements || input.legacyPlacements.length === 0) {
      throw new Error("No signature placement was provided.");
    }
    return input.legacyPlacements.map((p) => ({ type: "signature" as const, ...p }));
  }

  const byId = new Map(snapshot.map((f) => [f.id, f]));
  const textValues = input.textValues ?? {};

  for (const submittedId of Object.keys(textValues)) {
    const field = byId.get(submittedId);
    if (!field) throw new Error("A submitted field does not belong to this document.");
    if (field.type !== "text") throw new Error("A submitted value targets a non-text field.");
  }

  const fields: FieldPlacement[] = [];
  for (const field of snapshot) {
    if (field.type === "signature") {
      if (field.required && !input.signaturePngBytes) {
        throw new Error("A required signature field is missing its signature.");
      }
      fields.push({ type: "signature", page: field.page, x: field.x, y: field.y, w: field.w, h: field.h });
    } else {
      const value = textValues[field.id];
      if (field.required && (value === undefined || value.length === 0)) {
        throw new Error(`The "${field.label ?? "text"}" field is required.`);
      }
      if (value !== undefined) {
        fields.push({ type: "text", page: field.page, x: field.x, y: field.y, w: field.w, h: field.h, value });
      }
    }
  }
  if (fields.length === 0) throw new Error("No signature placement was provided.");
  return fields;
}

export async function finalizeNativeSignature(input: {
  workspaceId: string;
  documentId: string;
  actorId: string | null;
  signerName: string;
  signerEmail: string;
  /** Required only if the resolved field set includes a required signature field. */
  signaturePngBytes?: Buffer;
  /** New path: per-text-field values, keyed by the field's id in documents.fieldsSnapshot. */
  textValues?: Record<string, string>;
  /** Legacy path: only consulted when the document has no fieldsSnapshot. */
  placements?: SignaturePlacement[];
  verification: "self_sign" | "link_only" | "email_otp";
  consentAt?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  existingEnvelopeId?: string;
  existingRecipientId?: string;
  /** When set, signing and offer acceptance commit in one transaction. */
  offerId?: string;
}) {
  await purgeExpiredSignatureData({ workspaceId: input.workspaceId });
  const [document] = await db.select({ id: documents.id, name: documents.name, storageKey: documents.storageKey, mimeType: documents.mimeType, status: documents.status, signatureStatus: documents.signatureStatus, fieldsSnapshot: documents.fieldsSnapshot }).from(documents).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId))).limit(1);
  const expectedStatus = input.existingEnvelopeId ? "pending" : "unsigned";
  if (!document || document.status !== "active" || document.signatureStatus !== expectedStatus || document.mimeType !== "application/pdf") throw new Error("This document is no longer available for signing.");

  const fields = resolveFields({
    documentId: input.documentId,
    fieldsSnapshot: document.fieldsSnapshot,
    signaturePngBytes: input.signaturePngBytes ?? null,
    textValues: input.textValues,
    legacyPlacements: input.placements,
    requireFrozenFields: Boolean(input.offerId),
  });

  const originalBytes = await storage.read(document.storageKey);
  const originalSha256 = sha256(originalBytes);
  const signedBytes = await bakeFieldsIntoPdf({ pdfBytes: originalBytes, signaturePngBytes: input.signaturePngBytes, fields });
  const signedDocumentSha256 = sha256(signedBytes);
  const signedAt = new Date();
  const previews = await Promise.all(([400, 1200] as const).map(async (width) => { const bytes = await createSignaturePreview({ documentName: document.name, signedAt, signedDocumentSha256, width }); return { width, bytes, checksum: sha256(bytes) }; }));
  const certificateBytes = await createCompletionCertificate({ documentName: document.name, signerName: input.signerName, signerEmail: input.signerEmail, signedAt, originalSha256, signedDocumentSha256, previewChecksums: previews.map((p) => ({ label: `Preview ${p.width}px`, sha256: p.checksum })), verification: input.verification });
  const signedKey = key(input.workspaceId, "signed-document", "pdf");
  const certificateKey = key(input.workspaceId, `certificate-v${NATIVE_CERTIFICATE_VERSION}`, "pdf");
  const previewKeys = previews.map((p) => ({ ...p, key: key(input.workspaceId, `preview-${p.width}`, "png") }));
  const generatedStorageKeys = [signedKey, certificateKey, ...previewKeys.map((p) => p.key)];
  await Promise.all([storage.put(signedKey, signedBytes, "application/pdf"), storage.put(certificateKey, certificateBytes, "application/pdf"), ...previewKeys.map((p) => storage.put(p.key, p.bytes, "image/png"))]);

  try {
    return await db.transaction(async (tx) => {
    let nativeOffer:
      | {
          id: string;
          applicationId: string;
          candidateId: string;
          jobId: string;
          title: string;
          createdById: string;
        }
      | undefined;
    let nativeApplication:
      | {
          id: string;
          status: string;
          currentStageId: string | null;
        }
      | undefined;
    let hiredStage: { id: string } | undefined;
    let applicationHiredEvent: PersistedDomainEvent | null = null;

    // Lock both business rows before any signed state is persisted. This is
    // the reservation: a concurrent withdraw/reject either waits and observes
    // the committed hire, or causes the whole signing transaction to roll
    // back before the PDF becomes visible as signed.
    if (input.offerId) {
      const [offer] = await tx
        .select({
          id: offers.id,
          applicationId: offers.applicationId,
          candidateId: offers.candidateId,
          jobId: offers.jobId,
          title: offers.title,
          createdById: offers.createdById,
          status: offers.status,
          expiresAt: offers.expiresAt,
        })
        .from(offers)
        .where(
          and(
            eq(offers.workspaceId, input.workspaceId),
            eq(offers.id, input.offerId),
          ),
        )
        .for("update")
        .limit(1);
      if (!offer) throw new Error("The offer could not be resolved.");

      const [application] = await tx
        .select({
          id: applications.id,
          status: applications.status,
          currentStageId: applications.currentStageId,
        })
        .from(applications)
        .where(
          and(
            eq(applications.workspaceId, input.workspaceId),
            eq(applications.id, offer.applicationId),
          ),
        )
        .for("update")
        .limit(1);
      if (
        !application ||
        !isNativeOfferAcceptanceAvailable({
          offerStatus: offer.status,
          applicationStatus: application.status,
          expiresAt: offer.expiresAt,
        })
      ) {
        throw new Error("This offer or application is no longer available for signing.");
      }

      [hiredStage] = await tx
        .select({ id: jobStages.id })
        .from(jobStages)
        .where(
          and(
            eq(jobStages.workspaceId, input.workspaceId),
            eq(jobStages.jobId, offer.jobId),
            eq(jobStages.name, "Hired"),
          ),
        )
        .limit(1);
      nativeOffer = offer;
      nativeApplication = application;
    }

    const [locked] = await tx.select({ versionNumber: documentVersions.versionNumber, signatureStatus: documents.signatureStatus }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).where(and(eq(documentVersions.documentId, input.documentId), eq(documents.workspaceId, input.workspaceId), eq(documentVersions.isCurrent, true))).for("update").limit(1);
    if (!locked || locked.signatureStatus !== expectedStatus) throw new Error("The document changed while it was being signed.");
    const versionNumber = locked.versionNumber + 1;
    await tx.update(documentVersions).set({ isCurrent: false }).where(eq(documentVersions.documentId, input.documentId));
    const [version] = await tx.insert(documentVersions).values({ workspaceId: input.workspaceId, documentId: input.documentId, versionNumber, storageKey: signedKey, sizeBytes: signedBytes.byteLength, checksum: signedDocumentSha256, uploadedById: input.actorId }).returning({ id: documentVersions.id });
    if (!version) throw new Error("Signed document version could not be saved.");
    let providerEnvelopeId = `native:${randomUUID()}`;
    let envelope: { id: string; providerEnvelopeId?: string } | undefined;
    let recipient: { id: string } | undefined;
    if (input.existingEnvelopeId && input.existingRecipientId) {
      const [existing] = await tx.select({ id: signatureEnvelopes.id, providerEnvelopeId: signatureEnvelopes.providerEnvelopeId }).from(signatureEnvelopes).where(and(eq(signatureEnvelopes.id, input.existingEnvelopeId), eq(signatureEnvelopes.workspaceId, input.workspaceId))).limit(1);
      const [existingRecipient] = await tx.select({ id: signatureRecipients.id }).from(signatureRecipients).where(and(eq(signatureRecipients.id, input.existingRecipientId), eq(signatureRecipients.envelopeId, input.existingEnvelopeId), eq(signatureRecipients.workspaceId, input.workspaceId))).limit(1);
      envelope = existing;
      recipient = existingRecipient;
      if (!envelope || !recipient) throw new Error("Signing recipient could not be resolved.");
      providerEnvelopeId = envelope.providerEnvelopeId ?? providerEnvelopeId;
      await tx.update(signatureEnvelopes).set({ status: "completed", completedAt: signedAt, lastEventAt: signedAt, fieldsSnapshot: document.fieldsSnapshot ?? null }).where(eq(signatureEnvelopes.id, envelope.id));
      await tx.update(signatureRecipients).set({ status: "signed", signedAt }).where(eq(signatureRecipients.id, recipient.id));
    } else {
      const [createdEnvelope] = await tx.insert(signatureEnvelopes).values({ workspaceId: input.workspaceId, provider: "native", providerEnvelopeId, kind: "document", status: "completed", subject: document.name, createdById: input.actorId, sentAt: signedAt, completedAt: signedAt, fieldsSnapshot: document.fieldsSnapshot ?? null }).returning({ id: signatureEnvelopes.id });
      if (createdEnvelope) envelope = createdEnvelope;
      const [createdRecipient] = envelope ? await tx.insert(signatureRecipients).values({ workspaceId: input.workspaceId, envelopeId: envelope.id, providerRecipientId: `native:${randomUUID()}`, role: "signer", email: input.signerEmail, name: input.signerName, status: "signed", signedAt }).returning({ id: signatureRecipients.id }) : [];
      if (createdRecipient) recipient = createdRecipient;
    }
    if (!envelope || !recipient) throw new Error("Signature envelope could not be saved.");
    await tx.update(documents).set({ storageKey: signedKey, sizeBytes: signedBytes.byteLength, checksum: signedDocumentSha256, signatureStatus: "signed", signatureProvider: "native", signatureEnvelopeId: providerEnvelopeId, signatureEnvelopeRefId: envelope.id, signatureUrl: null, updatedAt: signedAt }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId)));
    const artifacts = await tx.insert(signatureArtifacts).values([
      { workspaceId: input.workspaceId, envelopeId: envelope.id, documentId: input.documentId, documentVersionId: version.id, kind: "signed_document", storageKey: signedKey, mimeType: "application/pdf", sizeBytes: signedBytes.byteLength, checksum: signedDocumentSha256, metadata: { originalSha256, signedDocumentSha256 } },
      { workspaceId: input.workspaceId, envelopeId: envelope.id, documentId: input.documentId, documentVersionId: version.id, kind: "completion_certificate", storageKey: certificateKey, mimeType: "application/pdf", sizeBytes: certificateBytes.byteLength, checksum: sha256(certificateBytes), certificateVersion: NATIVE_CERTIFICATE_VERSION, metadata: { originalSha256, signedDocumentSha256 } },
      ...previewKeys.map((p) => ({ workspaceId: input.workspaceId, envelopeId: envelope.id, documentId: input.documentId, documentVersionId: version.id, kind: `signed_preview_${p.width}`, storageKey: p.key, mimeType: "image/png", sizeBytes: p.bytes.byteLength, checksum: p.checksum, metadata: { signedDocumentSha256, width: p.width } })),
    ]).returning({ id: signatureArtifacts.id, kind: signatureArtifacts.kind });
    const common = { documentId: input.documentId, verification: input.verification };
    await evidence(tx, { workspaceId: input.workspaceId, envelopeId: envelope.id, recipientId: recipient.id, eventType: "created", payload: common });
    // Fully-resolved server-side fields, not raw client input — proves what
    // the signer actually saw (snapshot geometry + submitted content).
    await evidence(tx, { workspaceId: input.workspaceId, envelopeId: envelope.id, recipientId: recipient.id, eventType: "signature_placed", payload: { fields } });
    await evidence(tx, { workspaceId: input.workspaceId, envelopeId: envelope.id, recipientId: recipient.id, eventType: "signature_validated", payload: { originalSha256, consentAt: input.consentAt?.toISOString() ?? null } });
    await evidence(tx, { workspaceId: input.workspaceId, envelopeId: envelope.id, recipientId: recipient.id, eventType: "baked", payload: { signedDocumentSha256 } });
    await evidence(tx, { workspaceId: input.workspaceId, envelopeId: envelope.id, recipientId: recipient.id, eventType: "completed", payload: { certificateVersion: NATIVE_CERTIFICATE_VERSION, ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null } });
    await tx.insert(activityEvents).values({ workspaceId: input.workspaceId, actorId: input.actorId, entityType: "document", entityId: input.documentId, type: "document.signature_changed", metadata: { status: "signed", provider: "native", versionNumber } });
    if (nativeOffer && nativeApplication) {
      const [hired] = await tx
        .update(applications)
        .set({
          status: "hired",
          ...(hiredStage ? { currentStageId: hiredStage.id } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(applications.workspaceId, input.workspaceId),
            eq(applications.id, nativeApplication.id),
            eq(applications.status, "active"),
          ),
        )
        .returning({ id: applications.id });
      if (!hired) {
        throw new Error("The application changed while the offer was being signed.");
      }

      const [accepted] = await tx
        .update(offers)
        .set({ status: "accepted", decidedAt: signedAt, updatedAt: signedAt })
        .where(
          and(
            eq(offers.workspaceId, input.workspaceId),
            eq(offers.id, nativeOffer.id),
            eq(offers.status, "sent"),
          ),
        )
        .returning({ id: offers.id });
      if (!accepted) {
        throw new Error("The offer changed while the offer was being signed.");
      }

      if (hiredStage && hiredStage.id !== nativeApplication.currentStageId) {
        await tx.insert(applicationStageHistory).values({
          workspaceId: input.workspaceId,
          applicationId: nativeApplication.id,
          fromStageId: nativeApplication.currentStageId,
          toStageId: hiredStage.id,
          movedById: input.actorId ?? nativeOffer.createdById,
        });
      }
      await tx.insert(activityEvents).values({
        workspaceId: input.workspaceId,
        actorId: input.actorId ?? nativeOffer.createdById,
        entityType: "application",
        entityId: nativeApplication.id,
        type: "application.hired",
        metadata: { via: "native_offer_signature", offerId: nativeOffer.id },
      });
      await tx.insert(activityEvents).values({
        workspaceId: input.workspaceId,
        actorId: input.actorId ?? nativeOffer.createdById,
        entityType: "application",
        entityId: nativeApplication.id,
        type: "offer.accepted",
        metadata: { title: nativeOffer.title, via: "native_signature" },
      });
      applicationHiredEvent = await persistDomainEvent(tx, {
        name: "application.hired",
        workspaceId: input.workspaceId,
        actorId: input.actorId ?? nativeOffer.createdById,
        aggregateType: "application",
        aggregateId: nativeApplication.id,
        payload: {
          application: { id: nativeApplication.id, jobId: nativeOffer.jobId },
          candidate: { id: nativeOffer.candidateId },
          offer: { id: nativeOffer.id, title: nativeOffer.title },
        },
      });
    }
      return {
        envelopeId: envelope.id,
        versionId: version.id,
        recipientId: recipient.id,
        artifacts,
        applicationHiredEvent,
      };
    });
  } catch (error) {
    await Promise.all(
      generatedStorageKeys.map(async (storageKey) => {
        try {
          await storage.delete(storageKey);
        } catch (cleanupError) {
          log.warn({ cleanupError, storageKey }, "native signature rollback cleanup failed");
        }
      }),
    );
    throw error;
  }
}
