import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db, documentAssociations, documentVersions, documents, offers, type Offer } from "@harly/db";

import { buildOfferPdf } from "./offer-pdf";
import { getOfferRecipient } from "@/features/offers/core";
import { formatOfferComp } from "@/features/offers/shared";
import { storage } from "@/lib/storage";
import { createLogger } from "@/lib/logger";

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
}): Promise<{ documentId: string } | null> {
  const [existing] = await db
    .select({ documentId: documentAssociations.documentId })
    .from(documentAssociations)
    .where(
      and(
        eq(documentAssociations.workspaceId, input.workspaceId),
        eq(documentAssociations.targetType, OFFER_LETTER_TARGET_TYPE),
        eq(documentAssociations.targetId, input.offer.id),
      ),
    )
    .limit(1);
  if (existing) return { documentId: existing.documentId };

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
    return { documentId: document.id };
  });
}
