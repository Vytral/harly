"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { getTranslations } from "@/i18n/server";
import { z } from "zod";

import {
  candidates,
  applications,
  db,
  documentAssociations,
  documents,
  offers,
} from "@harly/db";

import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { finalizeNativeSignature } from "@/lib/esign/native/finalize";
import {
  ensureNativeOfferEnvelope,
  isNativeOfferSubmission,
} from "@/lib/esign/native/offer-signing";
import {
  isNativeOfferAcceptanceAvailable,
  isSignableNativeFieldsSnapshot,
} from "@/lib/esign/native/fields";
import { createLogger } from "@/lib/logger";
import {
  MAX_VECTOR_COMPRESSED_CHARS,
  validateVectorSaveInput,
} from "@/features/documents/signature-vector";

const log = createLogger("portal-native-sign");

const inputSchema = z.object({
  offerId: z.uuid(),
  signatureVectorBase64: z.string().min(1).max(MAX_VECTOR_COMPRESSED_CHARS),
  textValues: z.record(z.string(), z.string().max(200)).optional(),
});

export type PortalNativeSignResult = { ok: true } | { ok: false; error: string };

async function getCandidatePortalSession() {
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  return token ? resolvePortalSession(token) : null;
}

/** Candidate self-signs their offer letter in-portal — the native counterpart
 *  to the DocuSeal hosted-signing-page redirect. */
export async function signOfferNatively(input: unknown): Promise<PortalNativeSignResult> {
  const t = await getTranslations("server.portal.nativeSign");
  const session = await getCandidatePortalSession();
  if (!session) return { ok: false, error: t("sessionExpired") };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidSignature") };

  const [offer] = await db
    .select({
      id: offers.id,
      status: offers.status,
      candidateId: offers.candidateId,
      applicationId: offers.applicationId,
      createdById: offers.createdById,
      esignSubmissionId: offers.esignSubmissionId,
      signatureEnvelopeRefId: offers.signatureEnvelopeRefId,
      jobId: offers.jobId,
      title: offers.title,
      expiresAt: offers.expiresAt,
      applicationStatus: applications.status,
    })
    .from(offers)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, offers.candidateId),
        eq(candidates.workspaceId, offers.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      applications,
      and(
        eq(applications.id, offers.applicationId),
        eq(applications.workspaceId, offers.workspaceId),
      ),
    )
    .where(
      and(
        eq(offers.id, parsed.data.offerId),
        eq(offers.workspaceId, session.workspaceId),
        eq(offers.candidateId, session.candidateId),
      ),
    )
    .limit(1);
  if (!offer) return { ok: false, error: t("offerNotFound") };
  if (offer.status !== "sent") return { ok: false, error: t("offerNotAwaiting") };
  if (!isNativeOfferSubmission(offer.esignSubmissionId)) {
    return { ok: false, error: t("notNative") };
  }
  if (
    !isNativeOfferAcceptanceAvailable({
      offerStatus: offer.status,
      applicationStatus: offer.applicationStatus,
      expiresAt: offer.expiresAt,
    })
  ) {
    return { ok: false, error: t("offerUnavailable") };
  }

  const [association] = await db
    .select({
      documentId: documentAssociations.documentId,
      fieldsSnapshot: documents.fieldsSnapshot,
    })
    .from(documentAssociations)
    .innerJoin(documents, eq(documents.id, documentAssociations.documentId))
    .where(
      and(
        eq(documentAssociations.workspaceId, session.workspaceId),
        eq(documentAssociations.targetType, "offer_letter"),
        eq(documentAssociations.targetId, offer.id),
      ),
    )
    .limit(1);
  if (!association) return { ok: false, error: t("letterNotFound") };
  if (!isSignableNativeFieldsSnapshot(association.fieldsSnapshot)) {
    return { ok: false, error: t("notReady") };
  }

  const [candidate] = await db
    .select({ firstName: candidates.firstName, lastName: candidates.lastName, email: candidates.email })
    .from(candidates)
    .where(and(eq(candidates.id, session.candidateId), eq(candidates.workspaceId, session.workspaceId), isNull(candidates.deletedAt)))
    .limit(1);
  if (!candidate) return { ok: false, error: t("candidateNotFound") };
  const signerName = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ") || candidate.email || "Candidate";

  try {
    const envelope = await ensureNativeOfferEnvelope({
      workspaceId: session.workspaceId,
      offer: {
        id: offer.id,
        candidateId: offer.candidateId,
        title: offer.title,
        createdById: offer.createdById,
      },
      documentId: association.documentId,
      fieldsSnapshot: association.fieldsSnapshot,
    });
    const checked = validateVectorSaveInput(
      { vectorData: parsed.data.signatureVectorBase64 },
      await getTranslations("server.documents.signatureVector"),
    );
    if (!checked.ok) return { ok: false, error: checked.error };
    await finalizeNativeSignature({
      workspaceId: session.workspaceId,
      documentId: association.documentId,
      actorId: null,
      signerName,
      signerEmail: candidate.email ?? "",
      signatureVector: checked.vectorData,
      textValues: parsed.data.textValues,
      verification: "self_sign",
      existingEnvelopeId: envelope.envelopeId,
      existingRecipientId: envelope.recipientId,
      offerId: offer.id,
    });
  } catch (error) {
    log.error({ error, offerId: offer.id }, "native offer signature failed");
    return { ok: false, error: error instanceof Error ? error.message : t("signFailed") };
  }

  revalidatePath(`/portal/applications/${offer.applicationId}`);
  return { ok: true };
}
