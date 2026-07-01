"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db, jobHiringTeam } from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";
import type { HiringTeamRole } from "@/features/jobs/hiring-team-data";

type Result = { success: boolean; error?: string };

export async function addHiringTeamMember(input: {
  jobId: string;
  userId: string;
  role: HiringTeamRole;
}): Promise<Result> {
  try {
    const context = await requirePermission("jobs:edit");
    await db
      .insert(jobHiringTeam)
      .values({
        workspaceId: context.organization.id,
        jobId: input.jobId,
        userId: input.userId,
        role: input.role,
      })
      .onConflictDoNothing();
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "hiring_team.member_added",
      resourceType: "job",
      resourceId: input.jobId,
      severity: "info",
      metadata: { userId: input.userId, role: input.role },
    });
    revalidatePath(`/dashboard/jobs/${input.jobId}`);
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Unable to add member.",
    };
  }
}

export async function updateHiringTeamRole(input: {
  id: string;
  jobId: string;
  role: HiringTeamRole;
}): Promise<Result> {
  try {
    const context = await requirePermission("jobs:edit");
    await db
      .update(jobHiringTeam)
      .set({ role: input.role })
      .where(
        and(
          eq(jobHiringTeam.id, input.id),
          eq(jobHiringTeam.workspaceId, context.organization.id),
        ),
      );
    revalidatePath(`/dashboard/jobs/${input.jobId}`);
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Unable to update role.",
    };
  }
}

export async function removeHiringTeamMember(input: {
  id: string;
  jobId: string;
}): Promise<Result> {
  try {
    const context = await requirePermission("jobs:edit");
    await db
      .delete(jobHiringTeam)
      .where(
        and(
          eq(jobHiringTeam.id, input.id),
          eq(jobHiringTeam.workspaceId, context.organization.id),
        ),
      );
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "hiring_team.member_removed",
      resourceType: "job",
      resourceId: input.jobId,
      severity: "info",
      metadata: { memberId: input.id },
    });
    revalidatePath(`/dashboard/jobs/${input.jobId}`);
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Unable to remove member.",
    };
  }
}
