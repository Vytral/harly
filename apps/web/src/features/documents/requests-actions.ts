"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  activityEvents,
  applications,
  candidatePortalNotifications,
  db,
  documentRequests,
} from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";
import { canReviewRequest } from "./requests-shared";

const log = createLogger("document-requests");

export type DocumentRequestActionResult = { ok: boolean; error?: string };

async function manageContext(): Promise<
  { ok: true; context: Awaited<ReturnType<typeof requirePermission>> } | { ok: false; error: string }
> {
  try {
    return { ok: true, context: await requirePermission("documents:manage") };
  } catch {
    return { ok: false, error: "You do not have permission to manage documents." };
  }
}

const requestSchema = z.object({
  applicationId: z.uuid(),
  dueAt: z.iso.datetime().nullable().optional(),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Title is required.").max(160),
        instructions: z.string().trim().max(2000).optional(),
      }),
    )
    .min(1, "Add at least one document to request.")
    .max(20),
});

/**
 * Create one or more document requests against an application and notify the
 * candidate in their portal. The candidate uploads each through the portal; the
 * submit action links the resulting document + flips status to `submitted`.
 */
export async function requestDocuments(input: {
  applicationId: string;
  items: Array<{ title: string; instructions?: string }>;
  dueAt?: string | null;
}): Promise<DocumentRequestActionResult> {
  const auth = await manageContext();
  if (!auth.ok) return auth;
  const { context } = auth;

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const [application] = await db
    .select({ id: applications.id, candidateId: applications.candidateId })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, context.organization.id),
        eq(applications.id, parsed.data.applicationId),
      ),
    )
    .limit(1);
  if (!application) return { ok: false, error: "Application not found." };

  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(documentRequests)
      .values(
        parsed.data.items.map((item) => ({
          workspaceId: context.organization.id,
          applicationId: application.id,
          candidateId: application.candidateId,
          title: item.title,
          instructions: item.instructions?.trim() || null,
          dueAt,
          requestedById: context.user.id,
        })),
      )
      .returning({ id: documentRequests.id });

    await tx.insert(activityEvents).values({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      entityType: "candidate",
      entityId: application.candidateId,
      type: "document.requested",
      metadata: {
        applicationId: application.id,
        count: inserted.length,
        titles: parsed.data.items.map((item) => item.title),
      },
    });

    const count = parsed.data.items.length;
    await tx.insert(candidatePortalNotifications).values({
      workspaceId: context.organization.id,
      candidateId: application.candidateId,
      type: "document_requested",
      title: count === 1 ? "A document was requested" : `${count} documents were requested`,
      body:
        count === 1
          ? `Please upload: ${parsed.data.items[0]!.title}.`
          : `You have ${count} documents to upload for your application.`,
      href: `/portal/applications/${application.id}`,
      metadata: { applicationId: application.id, count },
    });
  });

  revalidatePath(`/dashboard/candidates/${application.candidateId}`);
  return { ok: true };
}

const reviewSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(["accepted", "declined"]),
  note: z.string().trim().max(2000).optional(),
});

/** Accept or decline a submitted request. Decline lets the candidate re-upload. */
export async function reviewDocumentRequest(input: {
  requestId: string;
  decision: "accepted" | "declined";
  note?: string;
}): Promise<DocumentRequestActionResult> {
  const auth = await manageContext();
  if (!auth.ok) return auth;
  const { context } = auth;

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid review." };
  }

  const [request] = await db
    .select({
      id: documentRequests.id,
      status: documentRequests.status,
      candidateId: documentRequests.candidateId,
      applicationId: documentRequests.applicationId,
      title: documentRequests.title,
    })
    .from(documentRequests)
    .where(
      and(
        eq(documentRequests.workspaceId, context.organization.id),
        eq(documentRequests.id, parsed.data.requestId),
      ),
    )
    .limit(1);
  if (!request) return { ok: false, error: "Document request not found." };
  if (!canReviewRequest(request.status)) {
    return { ok: false, error: "Only a submitted document can be reviewed." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(documentRequests)
      .set({
        status: parsed.data.decision,
        reviewedById: context.user.id,
        reviewedAt: new Date(),
        reviewNote: parsed.data.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentRequests.workspaceId, context.organization.id),
          eq(documentRequests.id, request.id),
          eq(documentRequests.status, "submitted"),
        ),
      );

    await tx.insert(candidatePortalNotifications).values({
      workspaceId: context.organization.id,
      candidateId: request.candidateId,
      type: parsed.data.decision === "accepted" ? "document_accepted" : "document_declined",
      title: parsed.data.decision === "accepted" ? "Document accepted" : "Document needs another upload",
      body:
        parsed.data.decision === "accepted"
          ? `Your upload for "${request.title}" was accepted.`
          : `Your upload for "${request.title}" was declined. Please upload it again.`,
      href: `/portal/applications/${request.applicationId}`,
      metadata: { requestId: request.id, applicationId: request.applicationId },
    });
  });

  revalidatePath(`/dashboard/candidates/${request.candidateId}`);
  return { ok: true };
}

const waiveSchema = z.object({ requestId: z.uuid() });

/** Waive a request the candidate no longer needs to fulfill (terminal). */
export async function waiveDocumentRequest(input: {
  requestId: string;
}): Promise<DocumentRequestActionResult> {
  const auth = await manageContext();
  if (!auth.ok) return auth;
  const { context } = auth;

  const parsed = waiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const [updated] = await db
    .update(documentRequests)
    .set({
      status: "waived",
      reviewedById: context.user.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documentRequests.workspaceId, context.organization.id),
        eq(documentRequests.id, parsed.data.requestId),
      ),
    )
    .returning({ candidateId: documentRequests.candidateId });
  if (!updated) return { ok: false, error: "Document request not found." };

  revalidatePath(`/dashboard/candidates/${updated.candidateId}`);
  return { ok: true };
}

const cancelSchema = z.object({ requestId: z.uuid() });

/** Delete a request that hasn't been submitted yet. */
export async function cancelDocumentRequest(input: {
  requestId: string;
}): Promise<DocumentRequestActionResult> {
  const auth = await manageContext();
  if (!auth.ok) return auth;
  const { context } = auth;

  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const [request] = await db
    .select({ status: documentRequests.status, candidateId: documentRequests.candidateId })
    .from(documentRequests)
    .where(
      and(
        eq(documentRequests.workspaceId, context.organization.id),
        eq(documentRequests.id, parsed.data.requestId),
      ),
    )
    .limit(1);
  if (!request) return { ok: false, error: "Document request not found." };
  if (request.status === "submitted") {
    return { ok: false, error: "This document was already submitted. Decline or accept it instead." };
  }

  await db
    .delete(documentRequests)
    .where(
      and(
        eq(documentRequests.workspaceId, context.organization.id),
        eq(documentRequests.id, parsed.data.requestId),
      ),
    );

  log.info({ requestId: parsed.data.requestId }, "document request cancelled");
  revalidatePath(`/dashboard/candidates/${request.candidateId}`);
  return { ok: true };
}
