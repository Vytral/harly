"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  candidates,
  db,
  documentAssociations,
  offers,
  savedSignatures,
} from "@harly/db";

import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { isNativeOfferSubmission } from "@/lib/esign/native/offer-signing";
import { finalizeNativeSignature } from "@/lib/esign/native/finalize";
import { decideOfferForApi } from "@/features/offers/service";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";

const log = createLogger("portal-native-sign");

const inputSchema = z.object({
  offerId: z.uuid(),
  signaturePngBase64: z.string().max(700_000).optional(),
  savedSignatureId: z.uuid().optional(),
  /** Per-text-field values, keyed by the field's id in documents.fieldsSnapshot. */
  textValues: z.record(z.string(), z.string().max(200)).optional(),
});

export type PortalNativeSignResult = { ok: true } | { ok: false; error: string };

function decodePng(value: string) {
  const raw = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  const bytes = Buffer.from(raw, "base64");
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < pngHeader.length || !bytes.subarray(0, 8).equals(pngHeader)) {
    throw new Error("Signature must be a valid PNG image.");
  }
  return bytes;
}

async function getSignatureBytes(input: {
  workspaceId: string;
  candidateId: string;
  signaturePngBase64?: string;
  savedSignatureId?: string;
}) {
  if (input.signaturePngBase64) return decodePng(input.signaturePngBase64);
  if (!input.savedSignatureId) throw new Error("Choose or draw a signature.");
  const [saved] = await db
    .select({ storageKey: savedSignatures.storageKey })
    .from(savedSignatures)
    .where(
      and(
        eq(savedSignatures.id, input.savedSignatureId),
        eq(savedSignatures.workspaceId, input.workspaceId),
        eq(savedSignatures.ownerType, "portal_candidate"),
        eq(savedSignatures.ownerId, input.candidateId),
        isNull(savedSignatures.deletedAt),
      ),
    )
    .limit(1);
  if (!saved) throw new Error("Saved signature not found.");
  const bytes = await storage.read(saved.storageKey);
  return decodePng(bytes.toString("base64"));
}

async function getCandidatePortalSession() {
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  return token ? resolvePortalSession(token) : null;
}

/** Candidate self-signs their offer letter in-portal — the native counterpart
 *  to the DocuSeal hosted-signing-page redirect. */
export async function signOfferNatively(input: unknown): Promise<PortalNativeSignResult> {
  const session = await getCandidatePortalSession();
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid signature details." };

  const [offer] = await db
    .select({
      id: offers.id,
      status: offers.status,
      candidateId: offers.candidateId,
      applicationId: offers.applicationId,
      createdById: offers.createdById,
      esignSubmissionId: offers.esignSubmissionId,
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
    .where(
      and(
        eq(offers.id, parsed.data.offerId),
        eq(offers.workspaceId, session.workspaceId),
        eq(offers.candidateId, session.candidateId),
      ),
    )
    .limit(1);
  if (!offer) return { ok: false, error: "Offer not found." };
  if (offer.status !== "sent") return { ok: false, error: "This offer is no longer awaiting a signature." };
  if (!isNativeOfferSubmission(offer.esignSubmissionId)) {
    return { ok: false, error: "This offer is not set up for native signing." };
  }

  const [association] = await db
    .select({ documentId: documentAssociations.documentId })
    .from(documentAssociations)
    .where(
      and(
        eq(documentAssociations.workspaceId, session.workspaceId),
        eq(documentAssociations.targetType, "offer_letter"),
        eq(documentAssociations.targetId, offer.id),
      ),
    )
    .limit(1);
  if (!association) return { ok: false, error: "The offer letter could not be found." };

  const [candidate] = await db
    .select({ firstName: candidates.firstName, lastName: candidates.lastName, email: candidates.email })
    .from(candidates)
    .where(and(eq(candidates.id, session.candidateId), eq(candidates.workspaceId, session.workspaceId), isNull(candidates.deletedAt)))
    .limit(1);
  if (!candidate) return { ok: false, error: "Candidate profile not found." };
  const signerName = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ") || candidate.email || "Candidate";

  try {
    const signatureBytes = await getSignatureBytes({
      workspaceId: session.workspaceId,
      candidateId: session.candidateId,
      signaturePngBase64: parsed.data.signaturePngBase64,
      savedSignatureId: parsed.data.savedSignatureId,
    });
    await finalizeNativeSignature({
      workspaceId: session.workspaceId,
      documentId: association.documentId,
      actorId: null,
      signerName,
      signerEmail: candidate.email ?? "",
      signaturePngBytes: signatureBytes,
      textValues: parsed.data.textValues,
      verification: "self_sign",
    });
    await decideOfferForApi({
      workspaceId: session.workspaceId,
      actorUserId: offer.createdById,
      offerId: offer.id,
      decision: "accepted",
    });
  } catch (error) {
    log.error({ error, offerId: offer.id }, "native offer signature failed");
    return { ok: false, error: error instanceof Error ? error.message : "Could not sign the offer." };
  }

  revalidatePath(`/portal/applications/${offer.applicationId}`);
  return { ok: true };
}
