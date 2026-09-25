import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  db,
  documentAssociations,
  documentVersions,
  documents,
  offers,
  signatureEnvelopes,
  signatureRecipients,
  type Offer,
} from "@harly/db";

import { buildOfferPdf } from "./offer-pdf";
import { getOfferRecipient } from "@/features/offers/core";
import { formatOfferComp } from "@/features/offers/shared";
import { storage } from "@/lib/storage";
import { createLogger } from "@/lib/logger";
import { isSignableNativeFieldsSnapshot } from "./fields";

const log = createLogger("native-offer-signing");

/** Target type used on documentAssociations for the offer letter itself
 *  (distinct from `"offer"`, which is attached supporting documents). */
const OFFER_LETTER_TARGET_TYPE = "offer_letter";

/** `esignSubmissionId` doubles as the provider-neutral correlation flag; native
 *  offers store this sentinel instead of a real DocuSeal submission id. */
const NATIVE_SUBMISSION_PREFIX = "native:";

export function isNativeOfferSubmission(esignSubmissionId: string | null): boolean {
  return !!esignSubmissionId?.startsWith(NATIVE_SUBMISSION_PREFIX);
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fmtDate(value: Date | string | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(d);
}

/**
 * Find (or create, idempotently) the native offer-letter document backing an
 * offer. Mirrors `createOfferEnvelope`'s DocuSeal path, but bakes an actual PDF
 * up front since native signing can only edit existing PDF bytes.
 */
export async function getOrCreateNativeOfferDocument(input: {
  workspaceId: string;
  offer: Offer;
}): Promise<{ documentId: string; fieldsSnapshot: unknown } | null> {
  const [existing] = await db
    .select({
      documentId: documentAssociations.documentId,
      fieldsSnapshot: documents.fieldsSnapshot,
    })
    .from(documentAssociations)
    .innerJoin(documents, eq(documents.id, documentAssociations.documentId))
    .where(
      and(
        eq(documentAssociations.workspaceId, input.workspaceId),
        eq(documentAssociations.targetType, OFFER_LETTER_TARGET_TYPE),
        eq(documentAssociations.targetId, input.offer.id),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      documentId: existing.documentId,
      fieldsSnapshot: existing.fieldsSnapshot,
    };
  }

  const recipient = await getOfferRecipient(input.workspaceId, input.offer.candidateId);
  if (!recipient?.email) {
    log.warn({ offerId: input.offer.id }, "getOrCreateNativeOfferDocument: candidate has no email");
    return null;
  }
  const candidateName = [recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || recipient.email;

  const salary = formatOfferComp({
    salaryAmount: input.offer.salaryAmount,
    currency: input.offer.currency,
    salaryPeriod: input.offer.salaryPeriod,
  });

  const pdfBytes = await buildOfferPdf({
    candidateName,
    companyName: recipient.companyName ?? "the team",
    jobTitle: input.offer.title,
    salary,
    equity: input.offer.equity,
    startDate: fmtDate(input.offer.startDate),
    expiresAt: fmtDate(input.offer.expiresAt),
    notes: input.offer.notes,
  });
  const checksum = sha256(pdfBytes);
  const name = `Offer — ${input.offer.title}.pdf`;
  const storageKey = `workspaces/${input.workspaceId}/offers/${randomUUID()}.pdf`;
  await storage.put(storageKey, pdfBytes, "application/pdf");

  return db.transaction(async (tx) => {
    const [document] = await tx
      .insert(documents)
      .values({
        workspaceId: input.workspaceId,
        name,
        originalName: name,
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.byteLength,
        checksum,
        storageKey,
        status: "active",
        signatureStatus: "unsigned",
        createdById: input.offer.createdById,
      })
      .returning({ id: documents.id });
    if (!document) throw new Error("Offer letter document could not be created.");
    await tx.insert(documentVersions).values({
      workspaceId: input.workspaceId,
      documentId: document.id,
      versionNumber: 1,
      storageKey,
      sizeBytes: pdfBytes.byteLength,
      checksum,
      uploadedById: input.offer.createdById,
      isCurrent: true,
    });
    await tx.insert(documentAssociations).values({
      workspaceId: input.workspaceId,
      documentId: document.id,
      targetType: OFFER_LETTER_TARGET_TYPE,
      targetId: input.offer.id,
    });
    await tx
      .update(offers)
      .set({ esignSubmissionId: `${NATIVE_SUBMISSION_PREFIX}${document.id}` })
      .where(and(eq(offers.id, input.offer.id), eq(offers.workspaceId, input.workspaceId)));
    return { documentId: document.id, fieldsSnapshot: null };
  });
}

/**
 * Create the provider-neutral native envelope only after the recruiter has
 * frozen a signable field layout. The document is moved to `pending` here so
 * finalization can use the same conditional document transition as other
 * native signing flows.
 */
export async function ensureNativeOfferEnvelope(input: {
  workspaceId: string;
  offer: Pick<Offer, "id" | "candidateId" | "title" | "createdById">;
  documentId: string;
  fieldsSnapshot: unknown;
}): Promise<{ envelopeId: string; recipientId: string }> {
  if (!isSignableNativeFieldsSnapshot(input.fieldsSnapshot)) {
    throw new Error("Place at least one required signature field before sending the offer.");
  }

  const [existingEnvelope] = await db
    .select({ id: signatureEnvelopes.id })
    .from(signatureEnvelopes)
    .where(
      and(
        eq(signatureEnvelopes.workspaceId, input.workspaceId),
        eq(signatureEnvelopes.provider, "native"),
        eq(signatureEnvelopes.offerId, input.offer.id),
      ),
    )
    .limit(1);
  if (existingEnvelope) {
    const [existingRecipient] = await db
      .select({ id: signatureRecipients.id })
      .from(signatureRecipients)
      .where(
        and(
          eq(signatureRecipients.workspaceId, input.workspaceId),
          eq(signatureRecipients.envelopeId, existingEnvelope.id),
        ),
      )
      .limit(1);
    if (!existingRecipient) throw new Error("Native signing recipient could not be resolved.");
    return { envelopeId: existingEnvelope.id, recipientId: existingRecipient.id };
  }

  const recipient = await getOfferRecipient(input.workspaceId, input.offer.candidateId);
  const recipientEmail = recipient?.email;
  if (!recipientEmail) throw new Error("The candidate does not have an email address.");
  const signerName =
    [recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || recipientEmail;
  const providerEnvelopeId = `${NATIVE_SUBMISSION_PREFIX}${input.documentId}`;

  return db.transaction(async (tx) => {
    const [lockedDocument] = await tx
      .select({ signatureStatus: documents.signatureStatus })
      .from(documents)
      .where(
        and(
          eq(documents.id, input.documentId),
          eq(documents.workspaceId, input.workspaceId),
        ),
      )
      .for("update")
      .limit(1);
    if (!lockedDocument || !["unsigned", "pending"].includes(lockedDocument.signatureStatus)) {
      throw new Error("This offer letter is no longer available for signing.");
    }

    const [racedEnvelope] = await tx
      .select({ id: signatureEnvelopes.id })
      .from(signatureEnvelopes)
      .where(
        and(
          eq(signatureEnvelopes.workspaceId, input.workspaceId),
          eq(signatureEnvelopes.provider, "native"),
          eq(signatureEnvelopes.offerId, input.offer.id),
        ),
      )
      .for("update")
      .limit(1);
    if (racedEnvelope) {
      const [racedRecipient] = await tx
        .select({ id: signatureRecipients.id })
        .from(signatureRecipients)
        .where(
          and(
            eq(signatureRecipients.workspaceId, input.workspaceId),
            eq(signatureRecipients.envelopeId, racedEnvelope.id),
          ),
        )
        .limit(1);
      if (!racedRecipient) throw new Error("Native signing recipient could not be resolved.");
      return { envelopeId: racedEnvelope.id, recipientId: racedRecipient.id };
    }

    const [envelope] = await tx
      .insert(signatureEnvelopes)
      .values({
        workspaceId: input.workspaceId,
        provider: "native",
        providerEnvelopeId,
        kind: "offer",
        status: "sent",
        offerId: input.offer.id,
        subject: input.offer.title,
        createdById: input.offer.createdById,
        sentAt: new Date(),
        fieldsSnapshot: input.fieldsSnapshot,
      })
      .returning({ id: signatureEnvelopes.id });
    if (!envelope) throw new Error("Native signature envelope could not be created.");

    const [savedRecipient] = await tx
      .insert(signatureRecipients)
      .values({
        workspaceId: input.workspaceId,
        envelopeId: envelope.id,
        providerRecipientId: `native:${randomUUID()}`,
        role: "signer",
        email: recipientEmail,
        name: signerName,
        clientUserId: input.offer.candidateId,
        status: "sent",
      })
      .returning({ id: signatureRecipients.id });
    if (!savedRecipient) throw new Error("Native signing recipient could not be created.");

    await tx
      .update(documents)
      .set({
        signatureStatus: "pending",
        signatureProvider: "native",
        signatureEnvelopeId: providerEnvelopeId,
        signatureEnvelopeRefId: envelope.id,
        signatureUrl: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documents.id, input.documentId),
          eq(documents.workspaceId, input.workspaceId),
          eq(documents.signatureStatus, "unsigned"),
        ),
      );
    await tx
      .update(offers)
      .set({
        esignSubmissionId: providerEnvelopeId,
        signatureEnvelopeRefId: envelope.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(offers.workspaceId, input.workspaceId),
          eq(offers.id, input.offer.id),
        ),
      );

    return { envelopeId: envelope.id, recipientId: savedRecipient.id };
  });
}
