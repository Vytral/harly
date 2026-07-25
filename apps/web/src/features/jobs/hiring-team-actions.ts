"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db, jobHiringTeam, jobs, member as workspaceMembers } from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";
import type { HiringTeamRole } from "@/features/jobs/hiring-team-data";

type Result = { success: boolean; error?: string };

const HIRING_TEAM_ROLES = new Set<HiringTeamRole>([
  "recruiter",
  "hiring_manager",
  "interviewer",
]);

async function validateJob(
  context: Awaited<ReturnType<typeof requirePermission>>,
  jobId: string,
) {
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(eq(jobs.id, jobId), eq(jobs.workspaceId, context.organization.id)),
    )
    .limit(1);
  return job ?? null;
}

export async function addHiringTeamMember(input: {
  jobId: string;
  userId: string;
  role: HiringTeamRole;
}): Promise<Result> {
  try {
    const context = await requirePermission("hiring_team:manage");
    if (!HIRING_TEAM_ROLES.has(input.role)) {
      return { success: false, error: "Invalid hiring-team role." };
    }
    const [job, member] = await Promise.all([
      validateJob(context, input.jobId),
      db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.organizationId, context.organization.id),
            eq(workspaceMembers.userId, input.userId),
          ),
        )
        .limit(1),
    ]);
    if (!job) return { success: false, error: "Job not found." };
    if (!member[0]) {
      return {
        success: false,
        error: "That person is not a member of this workspace.",
      };
    }
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
    const context = await requirePermission("hiring_team:manage");
    if (!HIRING_TEAM_ROLES.has(input.role)) {
      return { success: false, error: "Invalid hiring-team role." };
    }
    if (!(await validateJob(context, input.jobId))) {
      return { success: false, error: "Job not found." };
    }
    await db
      .update(jobHiringTeam)
      .set({ role: input.role })
      .where(
        and(
          eq(jobHiringTeam.id, input.id),
          eq(jobHiringTeam.workspaceId, context.organization.id),
          eq(jobHiringTeam.jobId, input.jobId),
        ),
      );
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "hiring_team.role_updated",
      resourceType: "job",
      resourceId: input.jobId,
      severity: "info",
      metadata: { memberId: input.id, role: input.role },
    });
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
    const context = await requirePermission("hiring_team:manage");
    if (!(await validateJob(context, input.jobId))) {
      return { success: false, error: "Job not found." };
    }
    await db
      .delete(jobHiringTeam)
      .where(
        and(
          eq(jobHiringTeam.id, input.id),
          eq(jobHiringTeam.workspaceId, context.organization.id),
          eq(jobHiringTeam.jobId, input.jobId),
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
