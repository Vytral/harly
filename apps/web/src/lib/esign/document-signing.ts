import "server-only";

import { and, eq } from "drizzle-orm";

import {
  activityEvents,
  db,
  documents,
  signatureEnvelopes,
  signatureRecipients,
} from "@harly/db";

import {
  createSubmissionFromPdf,
  freshEsignContext,
  getDocusealSubmissionUrl,
  type CreateSubmissionFromPdfInput,
} from "@/lib/esign/client";
import { OFFER_SIGNER_ROLE, pickSigner, signerSigningUrl } from "@/lib/esign/offer-signing";
import { createLogger } from "@/lib/logger";
import { getWorkspaceEsignConfig } from "@/lib/esign/config";
import { storage } from "@/lib/storage";

const log = createLogger("esign-document-signing");

/**
 * DocuSeal document-signing flow (no offer): send an existing Documents-hub file
 * for remote e-signature. The recipient is a remote signer (DocuSeal emails
 * them); `submission.completed` + the reconciliation cron flip the document's
 * `signatureStatus` and persist the signed PDF + audit log (see signed-artifact).
 *
 * Uploaded PDFs carry no field tags, so we place one signature field at the
 * bottom of page 1 via explicit fractional coordinates. Non-PDF files are
 * rejected (DocuSeal's PDF endpoint needs a PDF).
 */

const ENVELOPE_MAX_BYTES = 20 * 1024 * 1024;

export type SendDocumentSignatureInput = {
  workspaceId: string;
  documentId: string;
  actorId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  message?: string | null;
};

export type SendDocumentSignatureResult =
  | {
      ok: true;
      submissionId: string;
      signatureEnvelopeId: string;
      signatureUrl: string;
    }
  | { ok: false; error: string };

export async function sendDocumentForEnvelope(
  input: SendDocumentSignatureInput,
): Promise<SendDocumentSignatureResult> {
  const [document] = await db
    .select({
      id: documents.id,
      name: documents.name,
      mimeType: documents.mimeType,
      storageKey: documents.storageKey,
      status: documents.status,
      signatureStatus: documents.signatureStatus,
      signatureProvider: documents.signatureProvider,
    })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, input.workspaceId),
        eq(documents.id, input.documentId),
      ),
    )
    .limit(1);
  if (!document) return { ok: false, error: "Document not found." };
  if (document.status !== "active") {
    return { ok: false, error: "Archived documents cannot be sent for signature." };
  }
  if (["signed", "pending"].includes(document.signatureStatus)) {
    return {
      ok: false,
      error: "This document already has an active signature request. Void it first, or create a new document.",
    };
  }
  if (document.signatureProvider && document.signatureProvider !== "docuseal") {
    return { ok: false, error: "This document is tied to another signature provider." };
  }
  if (document.mimeType !== "application/pdf") {
    return {
      ok: false,
      error: `E-signature needs a PDF. Convert ${document.mimeType} to PDF and try again.`,
    };
  }

  const config = await getWorkspaceEsignConfig(input.workspaceId);
  if (!config) {
    return {
      ok: false,
      error: "DocuSeal is not connected. Connect it in Settings → Integrations first.",
    };
  }
  if (!config.webhookSecret) {
    return {
      ok: false,
      error: "Set the DocuSeal webhook secret in Settings → Integrations before sending for signature.",
    };
  }

  const ctx = await freshEsignContext(input.workspaceId);
  if (!ctx) {
    log.warn(
      { workspaceId: input.workspaceId, documentId: input.documentId },
      "sendDocumentForEnvelope: DocuSeal not connected",
    );
    return { ok: false, error: "DocuSeal is not connected. Reconnect it in Settings → Integrations." };
  }

  let bytes: Buffer;
  try {
    bytes = await storage.read(document.storageKey);
  } catch {
    return { ok: false, error: "The document file could not be read from storage." };
  }
  if (bytes.byteLength > ENVELOPE_MAX_BYTES) {
    return {
      ok: false,
      error: `Documents over 20 MB cannot be sent (this file is ${Math.round(bytes.byteLength / (1024 * 1024))} MB).`,
    };
  }

  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  const recipientName = input.recipientName.trim() || recipientEmail;
  const subject = input.subject.trim() || `Please sign: ${document.name}`;
  const body =
    input.message?.trim() || "Please review and sign the attached document.";

  const submissionInput: CreateSubmissionFromPdfInput = {
    name: subject,
    // Remote signing: DocuSeal emails the recipient the signing link.
    send_email: true,
    message: { subject, body },
    documents: [
      {
        name: document.name,
        file: bytes.toString("base64"),
        // No tags in an uploaded PDF → place one signature field bottom-left of
        // page 1 (fractional coords: x,y are the top-left as a fraction of the
        // page, w,h the size).
        fields: [
          {
            name: "Signature",
            type: "signature",
            role: OFFER_SIGNER_ROLE,
            required: true,
            areas: [{ x: 0.08, y: 0.88, w: 0.35, h: 0.06, page: 1 }],
          },
        ],
      },
    ],
    submitters: [
      {
        role: OFFER_SIGNER_ROLE,
        email: recipientEmail,
        name: recipientName,
        external_id: input.documentId,
        metadata: { documentId: input.documentId, workspaceId: input.workspaceId },
      },
    ],
  };

  let submissionId: string;
  let signingUrl: string | null;
  try {
    const submission = await createSubmissionFromPdf(ctx, submissionInput);
    submissionId = String(submission.id);
    const signer = pickSigner(submission.submitters, OFFER_SIGNER_ROLE);
    signingUrl = signerSigningUrl(ctx.baseUrl, signer);
  } catch (error) {
    log.error(
      { error, workspaceId: input.workspaceId, documentId: input.documentId },
      "sendDocumentForEnvelope: createSubmission failed",
    );
    return {
      ok: false,
      error:
        error instanceof Error
          ? `DocuSeal rejected the request: ${error.message}`
          : "DocuSeal could not create the submission. Check the connection and try again.",
    };
  }

  const senderUrl = getDocusealSubmissionUrl(ctx.baseUrl, submissionId);

  const signatureEnvelopeId = await db.transaction(async (tx) => {
    const [signatureEnvelope] = await tx
      .insert(signatureEnvelopes)
      .values({
        workspaceId: input.workspaceId,
        provider: "docuseal",
        providerEnvelopeId: submissionId,
        kind: "document",
        status: "sent",
        subject,
        createdById: input.actorId,
        sentAt: new Date(),
      })
      .returning({ id: signatureEnvelopes.id });
    if (!signatureEnvelope) throw new Error("Signature envelope could not be saved.");

    await tx.insert(signatureRecipients).values({
      workspaceId: input.workspaceId,
      envelopeId: signatureEnvelope.id,
      providerRecipientId: "1",
      role: "signer",
      email: recipientEmail,
      name: recipientName,
      routingOrder: 1,
      signingUrl,
      status: "sent",
    });

    await tx
      .update(documents)
      .set({
        signatureStatus: "pending",
        signatureProvider: "docuseal",
        signatureEnvelopeId: submissionId,
        signatureEnvelopeRefId: signatureEnvelope.id,
        signatureUrl: senderUrl,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documents.workspaceId, input.workspaceId),
          eq(documents.id, input.documentId),
        ),
      );

    await tx.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      entityType: "document",
      entityId: input.documentId,
      type: "document.signature_sent",
      metadata: {
        status: "pending",
        provider: "docuseal",
        submissionId,
        recipientEmail,
        recipientName,
        subject,
      },
    });
    return signatureEnvelope.id;
  });

  return {
    ok: true,
    submissionId,
    signatureEnvelopeId,
    signatureUrl: senderUrl,
  };
}
