import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { db, documentVersions, documents, signatureArtifacts, signatureEnvelopes, signatureEvidenceEvents, signatureRecipients, activityEvents } from "@harly/db";

import { bakeSignatureIntoPdf, type SignaturePlacement } from "./bake";
import { createCompletionCertificate, NATIVE_CERTIFICATE_VERSION } from "./certificate";
import { createSignaturePreview } from "./preview";
import { storage } from "@/lib/storage";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  await tx.insert(signatureEvidenceEvents).values({ workspaceId: input.workspaceId, envelopeId: input.envelopeId, recipientId: input.recipientId, eventType: input.eventType, occurredAt, payload, previousHash: previous?.hash ?? null, currentHash });
}

export async function finalizeNativeSignature(input: {
  workspaceId: string;
  documentId: string;
  actorId: string | null;
  signerName: string;
  signerEmail: string;
  signaturePngBytes: Buffer;
  placements: SignaturePlacement[];
  verification: "self_sign" | "link_only" | "email_otp";
  consentAt?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  existingEnvelopeId?: string;
  existingRecipientId?: string;
}) {
  const [document] = await db.select({ id: documents.id, name: documents.name, storageKey: documents.storageKey, mimeType: documents.mimeType, status: documents.status, signatureStatus: documents.signatureStatus }).from(documents).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId))).limit(1);
  const expectedStatus = input.existingEnvelopeId ? "pending" : "unsigned";
  if (!document || document.status !== "active" || document.signatureStatus !== expectedStatus || document.mimeType !== "application/pdf") throw new Error("This document is no longer available for signing.");
  const originalBytes = await storage.read(document.storageKey);
  const originalSha256 = sha256(originalBytes);
  const signedBytes = await bakeSignatureIntoPdf({ pdfBytes: originalBytes, signaturePngBytes: input.signaturePngBytes, placements: input.placements });
  const signedDocumentSha256 = sha256(signedBytes);
  const signedAt = new Date();
  const previews = await Promise.all(([400, 1200] as const).map(async (width) => { const bytes = await createSignaturePreview({ documentName: document.name, signedAt, signedDocumentSha256, width }); return { width, bytes, checksum: sha256(bytes) }; }));
  const certificateBytes = await createCompletionCertificate({ documentName: document.name, signerName: input.signerName, signerEmail: input.signerEmail, signedAt, originalSha256, signedDocumentSha256, previewChecksums: previews.map((p) => ({ label: `Preview ${p.width}px`, sha256: p.checksum })), verification: input.verification });
  const signedKey = key(input.workspaceId, "signed-document", "pdf");
  const certificateKey = key(input.workspaceId, `certificate-v${NATIVE_CERTIFICATE_VERSION}`, "pdf");
  const previewKeys = previews.map((p) => ({ ...p, key: key(input.workspaceId, `preview-${p.width}`, "png") }));
  await Promise.all([storage.put(signedKey, signedBytes, "application/pdf"), storage.put(certificateKey, certificateBytes, "application/pdf"), ...previewKeys.map((p) => storage.put(p.key, p.bytes, "image/png"))]);

  return db.transaction(async (tx) => {
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
      await tx.update(signatureEnvelopes).set({ status: "completed", completedAt: signedAt, lastEventAt: signedAt }).where(eq(signatureEnvelopes.id, envelope.id));
      await tx.update(signatureRecipients).set({ status: "signed", signedAt }).where(eq(signatureRecipients.id, recipient.id));
    } else {
      const [createdEnvelope] = await tx.insert(signatureEnvelopes).values({ workspaceId: input.workspaceId, provider: "native", providerEnvelopeId, kind: "document", status: "completed", subject: document.name, createdById: input.actorId, sentAt: signedAt, completedAt: signedAt }).returning({ id: signatureEnvelopes.id });
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
    await evidence(tx, { workspaceId: input.workspaceId, envelopeId: envelope.id, recipientId: recipient.id, eventType: "signature_placed", payload: { placements: input.placements } });
    await evidence(tx, { workspaceId: input.workspaceId, envelopeId: envelope.id, recipientId: recipient.id, eventType: "signature_validated", payload: { originalSha256, consentAt: input.consentAt?.toISOString() ?? null } });
    await evidence(tx, { workspaceId: input.workspaceId, envelopeId: envelope.id, recipientId: recipient.id, eventType: "baked", payload: { signedDocumentSha256 } });
    await evidence(tx, { workspaceId: input.workspaceId, envelopeId: envelope.id, recipientId: recipient.id, eventType: "completed", payload: { certificateVersion: NATIVE_CERTIFICATE_VERSION, ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null } });
    await tx.insert(activityEvents).values({ workspaceId: input.workspaceId, actorId: input.actorId, entityType: "document", entityId: input.documentId, type: "document.signature_changed", metadata: { status: "signed", provider: "native", versionNumber } });
    return { envelopeId: envelope.id, versionId: version.id, recipientId: recipient.id, artifacts };
  });
}
