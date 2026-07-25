"use server";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, jobApprovalRequests, jobs, member } from "@harly/db";
import {
  requireJobPermission,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { logAuditEvent } from "@/lib/audit-log";
import { createNotification } from "@/server/notify/inbox";

export async function requestJobApproval(input: {
  jobId: string;
  approverId: string;
}) {
  const ctx = await requireJobPermission("jobs:approve", input.jobId);
  const [job] = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.id, input.jobId),
        eq(jobs.workspaceId, ctx.organization.id),
        isNull(jobs.deletedAt),
      ),
    )
    .limit(1);
  if (!job) throw new Error("Job not found.");
  if (job.status !== "draft")
    throw new Error("Only draft jobs can request approval.");
  if (input.approverId === ctx.user.id)
    throw new Error("Requester cannot approve own job.");
  const [existing] = await db
    .select()
    .from(jobApprovalRequests)
    .where(
      and(
        eq(jobApprovalRequests.jobId, job.id),
        eq(jobApprovalRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [request] = await db
    .insert(jobApprovalRequests)
    .values({
      workspaceId: ctx.organization.id,
      jobId: job.id,
      requesterId: ctx.user.id,
      approverId: input.approverId,
    })
    .returning();
  const oversight = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(
        eq(member.organizationId, ctx.organization.id),
        sql`${member.role} in ('owner', 'admin')`,
      ),
    );
  await createNotification({
    workspaceId: ctx.organization.id,
    recipientIds: [input.approverId, ...oversight.map((row) => row.userId)],
    actorId: ctx.user.id,
    type: "job.approval_requested",
    title: `Approval requested: ${job.title}`,
    body: "Review this job before recruiting starts.",
    href: `/dashboard/jobs/${job.id}`,
    metadata: { jobId: job.id, requestId: request.id },
    dedupeKey: `approval:${request.id}:requested`,
  });
  await logAuditEvent({
    workspaceId: ctx.organization.id,
    actorId: ctx.user.id,
    actorEmail: ctx.user.email,
    action: "job.approval_requested",
    resourceType: "job",
    resourceId: job.id,
    severity: "info",
    metadata: { approverId: input.approverId, requestId: request.id },
  });
  return request;
}

export async function decideJobApproval(input: {
  requestId: string;
  decision: "approved" | "rejected";
  comment?: string;
}) {
  const ctx = await requirePermission("jobs:approve");
  const [request] = await db
    .select()
    .from(jobApprovalRequests)
    .where(
      and(
        eq(jobApprovalRequests.id, input.requestId),
        eq(jobApprovalRequests.workspaceId, ctx.organization.id),
      ),
    )
    .limit(1);
  if (!request) throw new Error("Approval request not found.");
  if (request.approverId !== ctx.user.id)
    throw new Error("Only assigned approver can decide.");
  if (request.status !== "pending")
    throw new Error("Approval request already decided.");
  const now = new Date();
  const [updated] = await db.transaction(async (tx) => {
    const [next] = await tx
      .update(jobApprovalRequests)
      .set({
        status: input.decision,
        comment: input.comment?.trim() || null,
        decidedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobApprovalRequests.id, request.id),
          eq(jobApprovalRequests.status, "pending"),
        ),
      )
      .returning();
    if (input.decision === "approved")
      await tx
        .update(jobs)
        .set({ status: "open", publishedAt: now, updatedAt: now })
        .where(and(eq(jobs.id, request.jobId), eq(jobs.status, "draft")));
    return [next];
  });
  await logAuditEvent({
    workspaceId: ctx.organization.id,
    actorId: ctx.user.id,
    actorEmail: ctx.user.email,
    action: `job.approval_${input.decision}`,
    resourceType: "job",
    resourceId: request.jobId,
    severity: input.decision === "rejected" ? "warning" : "info",
    metadata: { requestId: request.id, comment: input.comment ?? null },
  });
  const oversight = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(
        eq(member.organizationId, ctx.organization.id),
        sql`${member.role} in ('owner', 'admin')`,
      ),
    );
  await createNotification({
    workspaceId: ctx.organization.id,
    recipientIds: [request.requesterId, ...oversight.map((row) => row.userId)],
    actorId: ctx.user.id,
    type: `job.approval_${input.decision}`,
    title: `Job ${input.decision}: ${request.jobId}`,
    body: input.comment?.trim() || undefined,
    href: `/dashboard/jobs/${request.jobId}`,
    metadata: { jobId: request.jobId, requestId: request.id },
    dedupeKey: `approval:${request.id}:${input.decision}`,
  });
  return updated;
}

export async function getPendingJobApproval(jobId: string) {
  const { organization } = await getWorkspaceContext();
  const [request] = await db
    .select()
    .from(jobApprovalRequests)
    .where(
      and(
        eq(jobApprovalRequests.workspaceId, organization.id),
        eq(jobApprovalRequests.jobId, jobId),
        eq(jobApprovalRequests.status, "pending"),
      ),
    )
    .orderBy(desc(jobApprovalRequests.createdAt))
    .limit(1);
  return request ?? null;
}
