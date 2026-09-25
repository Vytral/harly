"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  activityEvents,
  db,
  documentAssociations,
  documentRequests,
  documentVersions,
  documents,
  notifications,
  signatureEnvelopes,
  signatureRecipients,
} from "@harly/db";

import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { canCandidateUpload } from "@/features/documents/requests-shared";
import { verifyUploadedDocument } from "@/features/documents/verify";
import { createLogger } from "@/lib/logger";
import { resumeWorkflowDocumentWaits } from "@/features/automations/runtime/worker";
import { reconcileDocumentRequestPackage } from "@/features/documents/requests-service";
import { rotateNativePortalSigningLink } from "@/lib/esign/native/remote";

const log = createLogger("portal-document-submit");

export type PortalSubmitResult = { ok: true } | { ok: false; error: string };

const signingViewSchema = z.object({ requestId: z.uuid() });

/**
 * Return a fresh, single-recipient native signing capability from the
 * authenticated candidate portal. The request/document joins are deliberately
 * repeated here instead of trusting a client-supplied document or envelope id.
 */
export async function createDocumentSigningViewAction(input: unknown): Promise<{ ok: true; signingUrl: string; expiresAt: string } | { ok: false; error: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return { ok: false, error: "Your session has expired." };
  const session = await resolvePortalSession(token);
  if (!session) return { ok: false, error: "Your session has expired." };
  const parsed = signingViewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid signing request." };

  const [request] = await db
    .select({
      requestId: documentRequests.id,
      applicationId: documentRequests.applicationId,
      documentId: documents.id,
      signatureStatus: documents.signatureStatus,
      signatureProvider: documents.signatureProvider,
      envelopeId: signatureEnvelopes.id,
    })
    .from(documentRequests)
    .innerJoin(documents, eq(documents.id, documentRequests.documentId))
    .innerJoin(signatureEnvelopes, eq(signatureEnvelopes.id, documents.signatureEnvelopeRefId))
    .where(and(
      eq(documentRequests.id, parsed.data.requestId),
      eq(documentRequests.workspaceId, session.workspaceId),
      eq(documentRequests.candidateId, session.candidateId),
      eq(documents.workspaceId, session.workspaceId),
      eq(signatureEnvelopes.workspaceId, session.workspaceId),
    ))
    .limit(1);
  if (!request || !request.documentId || !request.envelopeId) {
    return { ok: false, error: "This signing request was not found." };
  }
  if (request.signatureProvider !== "native" || request.signatureStatus !== "pending") {
    return { ok: false, error: "This document is not available for portal signing." };
  }

  const [recipient] = await db
    .select({ id: signatureRecipients.id })
    .from(signatureRecipients)
    .where(and(
      eq(signatureRecipients.workspaceId, session.workspaceId),
      eq(signatureRecipients.envelopeId, request.envelopeId),
      eq(signatureRecipients.role, "signer"),
      eq(signatureRecipients.status, "sent"),
    ))
    .orderBy(signatureRecipients.routingOrder, signatureRecipients.createdAt)
    .limit(1);
  if (!recipient) return { ok: false, error: "This signing request is not ready." };

  const result = await rotateNativePortalSigningLink({
    workspaceId: session.workspaceId,
    recipientId: recipient.id,
  });
  if (!result.ok) return result;
  revalidatePath(`/portal/applications/${request.applicationId}`);
  return { ok: true, signingUrl: result.signingUrl, expiresAt: result.expiresAt.toISOString() };
}

const submitSchema = z.object({
  requestId: z.uuid(),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
  checksum: z.string().trim().length(64),
  storageKey: z.string().trim().min(1).max(500),
});

/**
 * Candidate uploads a file that fulfills a document request. Auth is the portal
 * session. Flow: validate the request belongs to this candidate + is uploadable,
 * verify the uploaded bytes, adopt the file into the Documents hub (row + version
 * + candidate/application associations), link it to the request, flip status to
 * `submitted`, and notify the recruiter who requested it.
 */
export async function submitDocumentRequestAction(input: {
  requestId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storageKey: string;
}): Promise<PortalSubmitResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return { ok: false, error: "Your session has expired." };
  const session = await resolvePortalSession(token);
  if (!session) return { ok: false, error: "Your session has expired." };

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload." };

  const [request] = await db
    .select({
      id: documentRequests.id,
      status: documentRequests.status,
      title: documentRequests.title,
      applicationId: documentRequests.applicationId,
      packageId: documentRequests.packageId,
      requestedById: documentRequests.requestedById,
    })
    .from(documentRequests)
    .where(
      and(
        eq(documentRequests.workspaceId, session.workspaceId),
        eq(documentRequests.id, parsed.data.requestId),
        eq(documentRequests.candidateId, session.candidateId),
      ),
    )
    .limit(1);
  if (!request) return { ok: false, error: "This document request was not found." };
  if (!canCandidateUpload(request.status)) {
    return { ok: false, error: "This document can no longer be uploaded." };
  }

  const name = parsed.data.originalName.replace(/[\r\n]/g, "").slice(0, 255);
  const checked = await verifyUploadedDocument({
    workspaceId: session.workspaceId,
    storageKey: parsed.data.storageKey,
    name,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
    checksum: parsed.data.checksum,
  });
  if ("error" in checked) return { ok: false, error: checked.error };

  try {
    await db.transaction(async (tx) => {
      const [document] = await tx
        .insert(documents)
        .values({
          workspaceId: session.workspaceId,
          name: request.title.slice(0, 255),
          originalName: name,
          mimeType: parsed.data.mimeType,
          sizeBytes: parsed.data.sizeBytes,
          checksum: checked.checksum,
          storageKey: parsed.data.storageKey,
          // No dashboard user owns a candidate upload; the requester reviews it.
          ownerId: request.requestedById ?? null,
          createdById: request.requestedById ?? null,
        })
        .returning({ id: documents.id });
      if (!document) throw new Error("Document could not be saved.");

      await tx.insert(documentVersions).values({
        workspaceId: session.workspaceId,
        documentId: document.id,
        versionNumber: 1,
        storageKey: parsed.data.storageKey,
        sizeBytes: parsed.data.sizeBytes,
        checksum: checked.checksum,
        uploadedById: request.requestedById ?? null,
      });

      await tx.insert(documentAssociations).values([
        {
          workspaceId: session.workspaceId,
          documentId: document.id,
          targetType: "candidate",
          targetId: session.candidateId,
          createdById: request.requestedById ?? null,
        },
        {
          workspaceId: session.workspaceId,
          documentId: document.id,
          targetType: "application",
          targetId: request.applicationId,
          createdById: request.requestedById ?? null,
        },
      ]);

      // Atomically claim the request: only advance if still uploadable, so a
      // double submit can't overwrite an already-submitted upload.
      const [advanced] = await tx
        .update(documentRequests)
        .set({
          status: "submitted",
          documentId: document.id,
          submittedAt: new Date(),
          // Clear any prior review so a re-upload after a decline reopens it.
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documentRequests.workspaceId, session.workspaceId),
            eq(documentRequests.id, request.id),
            eq(documentRequests.status, request.status),
          ),
        )
        .returning({ id: documentRequests.id });
      if (!advanced) throw new Error("This document was already submitted.");
      if (request.packageId) await reconcileDocumentRequestPackage(tx, { workspaceId: session.workspaceId, packageId: request.packageId });

      await tx.insert(activityEvents).values({
        workspaceId: session.workspaceId,
        actorId: null,
        entityType: "candidate",
        entityId: session.candidateId,
        type: "document.submitted",
        metadata: {
          requestId: request.id,
          applicationId: request.applicationId,
          documentId: document.id,
          title: request.title,
        },
      });

      // Notify the requester (falls back to nobody if the requester is gone).
      if (request.requestedById) {
        const candidateName = [session.firstName, session.lastName].filter(Boolean).join(" ") || session.email;
        await tx.insert(notifications).values({
          workspaceId: session.workspaceId,
          userId: request.requestedById,
          actorId: null,
          type: "document.submitted",
          title: "Document submitted",
          body: `${candidateName} uploaded "${request.title}" for review.`,
          href: `/dashboard/candidates/${session.candidateId}`,
          metadata: { requestId: request.id, applicationId: request.applicationId },
          dedupeKey: `doc-request-submit-${request.id}-${document.id}`,
        });
      }
    });
  } catch (error) {
    log.error({ error, requestId: request.id }, "submitDocumentRequestAction failed");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not submit the document.",
    };
  }

  // The upload transaction is committed before the resolver reads it. The
  // resolver rechecks the complete package under a workflow lease.
  await resumeWorkflowDocumentWaits({
    workspaceId: session.workspaceId,
    resourceId: request.packageId ?? request.applicationId,
  });
  revalidatePath(`/portal/applications/${request.applicationId}`);
  return { ok: true };
}
