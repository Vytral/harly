"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { candidates, db, dsarRequests } from "@harly/db";

import {
  permanentlyDeleteCandidate,
  trashCandidate,
} from "@/features/candidates/data";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";
import {
  enqueueCandidateDeletionJob,
  markCandidateDeletionBlocked,
  markCandidateDeletionCompleted,
  markCandidateDeletionFailed,
  startCandidateDeletionJob,
} from "@/features/candidates/deletion-jobs";

export type DsarRequestListItem = {
  id: string;
  candidateId: string | null;
  candidateName: string | null;
  candidateEmail: string | null;
  candidateAvatarUrl: string | null;
  type: "export" | "erasure";
  status: "pending" | "processing" | "blocked" | "completed" | "denied";
  requestedBy: string | null;
  processedBy: string | null;
  notes: string | null;
  blockedReason: string | null;
  blockedAt: Date | null;
  reviewDueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export async function getDsarRequests(): Promise<DsarRequestListItem[]> {
  const context = await requirePermission("dsar:manage");

  const requests = await db
    .select({
      id: dsarRequests.id,
      candidateId: dsarRequests.candidateId,
      candidateFirstName: candidates.firstName,
      candidateLastName: candidates.lastName,
      candidateEmail: candidates.email,
      candidateAvatarUrl: candidates.avatarUrl,
      type: dsarRequests.type,
      status: dsarRequests.status,
      requestedBy: dsarRequests.requestedBy,
      processedBy: dsarRequests.processedBy,
      notes: dsarRequests.notes,
      blockedReason: dsarRequests.blockedReason,
      blockedAt: dsarRequests.blockedAt,
      reviewDueAt: dsarRequests.reviewDueAt,
      completedAt: dsarRequests.completedAt,
      createdAt: dsarRequests.createdAt,
    })
    .from(dsarRequests)
    .leftJoin(candidates, eq(candidates.id, dsarRequests.candidateId))
    .where(eq(dsarRequests.workspaceId, context.organization.id))
    .orderBy(desc(dsarRequests.createdAt));

  return requests.map((request) => ({
    id: request.id,
    candidateId: request.candidateId,
    candidateName:
      [request.candidateFirstName, request.candidateLastName]
        .filter(Boolean)
        .join(" ") || null,
    candidateEmail: request.candidateEmail,
    candidateAvatarUrl: request.candidateAvatarUrl,
    type: request.type,
    status: request.status,
    requestedBy: request.requestedBy,
    processedBy: request.processedBy,
    notes: request.notes,
    blockedReason: request.blockedReason,
    blockedAt: request.blockedAt,
    reviewDueAt: request.reviewDueAt,
    completedAt: request.completedAt,
    createdAt: request.createdAt,
  }));
}

const reviewSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approve", "deny"]),
  notes: z.string().trim().max(1000).optional(),
});

export async function reviewDsarRequestAction(
  input: z.infer<typeof reviewSchema>,
) {
  const context = await requirePermission("dsar:manage");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid request review." };
  }

  const [request] = await db
    .select({
      id: dsarRequests.id,
      status: dsarRequests.status,
      type: dsarRequests.type,
    })
    .from(dsarRequests)
    .where(
      and(
        eq(dsarRequests.id, parsed.data.requestId),
        eq(dsarRequests.workspaceId, context.organization.id),
      ),
    )
    .limit(1);

  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "pending") {
    return { ok: false, error: "This request has already been reviewed." };
  }

  const now = new Date();
  const approved = parsed.data.decision === "approve";
  const notes = parsed.data.notes || null;

  await db
    .update(dsarRequests)
    .set({
      status: approved ? "processing" : "denied",
      processedBy: context.user.email,
      notes,
      blockedReason: null,
      blockedBy: null,
      blockedAt: null,
      reviewDueAt: null,
      completedAt: approved ? null : now,
      updatedAt: now,
    })
    .where(
      and(
        eq(dsarRequests.id, request.id),
        eq(dsarRequests.workspaceId, context.organization.id),
      ),
    );

  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: approved ? "dsar.request.approved" : "dsar.request.denied",
    resourceType: "dsar_request",
    resourceId: request.id,
    metadata: { type: request.type, notes: notes ?? undefined },
    severity: approved ? "info" : "warning",
  });

  revalidatePath("/settings/legal");
  return { ok: true };
}

const fulfilSchema = z.object({
  requestId: z.string().uuid(),
  candidateId: z.string().uuid(),
});

/** Irreversibly fulfils an approved erasure request from the candidate dossier. */
export async function fulfilDsarErasureAction(
  input: z.infer<typeof fulfilSchema>,
) {
  const parsed = fulfilSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid erasure request." };

  const context = await requirePermission("dsar:manage");
  await requirePermission("candidates:delete");
  const [request] = await db
    .select({ id: dsarRequests.id })
    .from(dsarRequests)
    .where(
      and(
        eq(dsarRequests.id, parsed.data.requestId),
        eq(dsarRequests.workspaceId, context.organization.id),
        eq(dsarRequests.candidateId, parsed.data.candidateId),
        eq(dsarRequests.type, "erasure"),
        inArray(dsarRequests.status, ["processing", "blocked"]),
      ),
    )
    .limit(1);
  if (!request)
    return {
      ok: false,
      error: "This erasure request is not ready for fulfilment.",
    };

  const trashed = await trashCandidate(parsed.data.candidateId);
  if (!trashed.ok) {
    const [alreadyTrashed] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.id, parsed.data.candidateId),
          eq(candidates.workspaceId, context.organization.id),
          isNotNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (!alreadyTrashed) return { ok: false, error: trashed.error };
  }

  const job = await enqueueCandidateDeletionJob({
    workspaceId: context.organization.id,
    candidateId: parsed.data.candidateId,
    requestId: request.id,
    requestType: "dsar_erasure",
    requestedBy: context.user.email,
  });
  if (!job) return { ok: false, error: "Could not queue erasure." };
  if (job.status === "completed") return { ok: true };
  if (["processing", "blocked", "dead_letter"].includes(job.status)) {
    return {
      ok: false,
      error: "This erasure is already being processed or blocked.",
    };
  }
  const claimed = await startCandidateDeletionJob(
    job.id,
    `dsar:${context.user.id}`,
  );
  if (!claimed) {
    return { ok: false, error: "This erasure is already being processed." };
  }

  const deleted = await permanentlyDeleteCandidate(
    parsed.data.candidateId,
    context.user.email,
  );
  if (!deleted.ok) {
    if (deleted.error.includes("legal hold")) {
      await markCandidateDeletionBlocked(
        job.id,
        deleted.error,
        `dsar:${context.user.id}`,
      );
      await db
        .update(dsarRequests)
        .set({
          status: "blocked",
          blockedReason: deleted.error,
          blockedBy: context.user.email,
          blockedAt: new Date(),
          reviewDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          notes: `Erasure blocked: ${deleted.error}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(dsarRequests.id, request.id),
            eq(dsarRequests.workspaceId, context.organization.id),
          ),
        );
    } else {
      await markCandidateDeletionFailed(
        job.id,
        deleted.error,
        `dsar:${context.user.id}`,
      );
    }
    return { ok: false, error: deleted.error };
  }
  await markCandidateDeletionCompleted(
    job.id,
    deleted.stats,
    `dsar:${context.user.id}`,
  );

  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "dsar.request.fulfilled",
    resourceType: "dsar_request",
    resourceId: request.id,
    metadata: { candidateId: parsed.data.candidateId, type: "erasure" },
    severity: "critical",
  });
  revalidatePath("/dashboard/candidates");
  revalidatePath("/settings/legal");
  return { ok: true };
}
