"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db, candidateReferrals, candidates, member as authMembers } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  requireJobPermission,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import { emitWebhookEvent } from "@/server/webhooks/emit";
import { publishPersistedDomainEvents } from "@/server/events/emit";
import { logAuditEvent } from "@/lib/audit-log";

import {
  createReferralRecord,
  deleteReferralRecord,
  serializeReferral,
} from "./service";

const referCandidateSchema = z.object({
  candidateId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
  jobId: z.string().trim().min(1).nullable().optional(),
  referredById: z.string().trim().min(1).optional(),
  note: z.string().trim().max(2000).optional(),
  featured: z.boolean().optional(),
});

async function assertActiveWorkspaceMember(workspaceId: string, userId: string) {
  const [member] = await db
    .select({ userId: authMembers.userId })
    .from(authMembers)
    .where(
      and(
        eq(authMembers.organizationId, workspaceId),
        eq(authMembers.userId, userId),
        eq(authMembers.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(member);
}

/**
 * "Isabella recommends this candidate" for a candidate already in the
 * system. Base gate is collab:write (broader than candidates:edit — a
 * hiring_manager can vouch for someone), but attributing the referral to
 * someone else, or marking it featured, escalates to candidates:edit.
 */
export async function referCandidate(
  input: z.infer<typeof referCandidateSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = referCandidateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid referral.",
      };
    }

    const { organization: workspace, user } = await getWorkspaceContext();
    if (workspace.id !== parsed.data.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    await requirePermission("collab:write");

    const referredById = parsed.data.referredById ?? user.id;
    if (referredById !== user.id) {
      await requirePermission("candidates:edit");
      if (!(await assertActiveWorkspaceMember(workspace.id, referredById))) {
        return {
          success: false,
          error: "Referrer is not an active member of this workspace.",
        };
      }
    }
    if (parsed.data.featured) {
      await requirePermission("candidates:edit");
    }
    if (parsed.data.jobId) {
      await requireJobPermission("collab:write", parsed.data.jobId);
    }

    const [candidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.id, parsed.data.candidateId),
          eq(candidates.workspaceId, workspace.id),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (!candidate) {
      return { success: false, error: "Candidate not found." };
    }

    const result = await db.transaction((tx) =>
      createReferralRecord(tx, {
        workspaceId: workspace.id,
        candidateId: candidate.id,
        jobId: parsed.data.jobId ?? null,
        referredById,
        createdById: user.id,
        note: parsed.data.note,
        featured: parsed.data.featured,
      }),
    );

    if ("duplicate" in result) {
      return {
        success: false,
        error: "This person has already referred this candidate for this role.",
      };
    }

    await publishPersistedDomainEvents([result.event]);
    await emitWebhookEvent(
      workspace.id,
      "candidate.referred",
      { referral: serializeReferral(result.referral) },
      { skipDomainEvent: true, actorId: user.id },
    );
    await logAuditEvent({
      workspaceId: workspace.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "candidate.referred",
      resourceType: "candidate",
      resourceId: candidate.id,
      severity: "info",
      metadata: { referralId: result.referral.id },
    });

    revalidatePath(`/dashboard/candidates/${candidate.id}`);
    revalidatePath("/dashboard/candidates");
    return { success: true };
  } catch (error) {
    console.error("Failed to refer candidate", error);
    return { success: false, error: "Unable to refer candidate." };
  }
}

const toggleFeaturedSchema = z.object({
  referralId: z.string().trim().min(1),
  featured: z.boolean(),
});

/**
 * Marks/unmarks a referral as featured. candidateId/workspaceId are
 * deliberately NOT accepted as input — both are derived server-side (session
 * + the loaded referral row) so a client can never point the audit trail at
 * a candidate the referral doesn't actually belong to.
 */
export async function toggleReferralFeatured(
  input: z.infer<typeof toggleFeaturedSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = toggleFeaturedSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid request." };
    }

    const { organization: workspace, user } = await getWorkspaceContext();
    await requirePermission("candidates:edit");

    const [referral] = await db
      .select()
      .from(candidateReferrals)
      .where(
        and(
          eq(candidateReferrals.id, parsed.data.referralId),
          eq(candidateReferrals.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    if (!referral) {
      return { success: false, error: "Referral not found." };
    }

    if (referral.jobId) {
      await requireJobPermission("candidates:edit", referral.jobId);
    }

    await db
      .update(candidateReferrals)
      .set({
        featured: parsed.data.featured,
        featuredById: parsed.data.featured ? user.id : null,
        featuredAt: parsed.data.featured ? new Date() : null,
      })
      .where(
        and(
          eq(candidateReferrals.id, referral.id),
          eq(candidateReferrals.workspaceId, workspace.id),
        ),
      );

    await logAuditEvent({
      workspaceId: workspace.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "candidate.referral_featured_toggled",
      resourceType: "candidate",
      resourceId: referral.candidateId,
      severity: "info",
      metadata: { referralId: referral.id, featured: parsed.data.featured },
    });

    revalidatePath(`/dashboard/candidates/${referral.candidateId}`);
    revalidatePath("/dashboard/candidates");
    return { success: true };
  } catch (error) {
    console.error("Failed to toggle referral featured", error);
    return { success: false, error: "Unable to update referral." };
  }
}

const deleteReferralSchema = z.object({
  referralId: z.string().trim().min(1),
});

/**
 * Deletes a referral you created, or (with candidates:edit) one someone else
 * created. Only `referralId` is accepted — candidateId/workspaceId are
 * always derived from the loaded row, never trusted from the client.
 */
export async function deleteReferral(
  input: z.infer<typeof deleteReferralSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = deleteReferralSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid request." };
    }

    const { organization: workspace, user } = await getWorkspaceContext();
    await requirePermission("collab:write");

    const [referral] = await db
      .select()
      .from(candidateReferrals)
      .where(
        and(
          eq(candidateReferrals.id, parsed.data.referralId),
          eq(candidateReferrals.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    if (!referral) {
      return { success: false, error: "Referral not found." };
    }

    const isOwnReferral = referral.createdById === user.id;
    if (!isOwnReferral) {
      await requirePermission("candidates:edit");
    }
    if (referral.jobId) {
      await requireJobPermission(
        isOwnReferral ? "collab:write" : "candidates:edit",
        referral.jobId,
      );
    }

    const candidateId = referral.candidateId;
    const event = await db.transaction((tx) =>
      deleteReferralRecord(
        tx,
        { id: referral.id, workspaceId: workspace.id, candidateId },
        user.id,
      ),
    );

    if (event) {
      await publishPersistedDomainEvents([event]);
      await emitWebhookEvent(
        workspace.id,
        "candidate.referral_deleted",
        { referralId: referral.id, candidateId },
        { skipDomainEvent: true, actorId: user.id },
      );
      await logAuditEvent({
        workspaceId: workspace.id,
        actorId: user.id,
        actorEmail: user.email,
        action: "candidate.referral_deleted",
        resourceType: "candidate",
        resourceId: candidateId,
        severity: "warning",
        metadata: { referralId: referral.id },
      });
    }

    revalidatePath(`/dashboard/candidates/${candidateId}`);
    revalidatePath("/dashboard/candidates");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete referral", error);
    return { success: false, error: "Unable to delete referral." };
  }
}
