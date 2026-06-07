"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db, jobHiringTeam } from "@openhire/db";
import { requireWorkspaceRole } from "@/features/workspaces/context";
import type { HiringTeamRole } from "@/features/jobs/hiring-team-data";

type Result = { success: boolean; error?: string };

export async function addHiringTeamMember(input: {
  jobId: string;
  userId: string;
  role: HiringTeamRole;
}): Promise<Result> {
  try {
    const context = await requireWorkspaceRole(["owner", "admin", "recruiter"]);
    await db
      .insert(jobHiringTeam)
      .values({
        workspaceId: context.organization.id,
        jobId: input.jobId,
        userId: input.userId,
        role: input.role,
      })
      .onConflictDoNothing();
    revalidatePath(`/dashboard/jobs/${input.jobId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to add member.",
    };
  }
}

export async function updateHiringTeamRole(input: {
  id: string;
  jobId: string;
  role: HiringTeamRole;
}): Promise<Result> {
  try {
    const context = await requireWorkspaceRole(["owner", "admin", "recruiter"]);
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
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to update role.",
    };
  }
}

export async function removeHiringTeamMember(input: {
  id: string;
  jobId: string;
}): Promise<Result> {
  try {
    const context = await requireWorkspaceRole(["owner", "admin", "recruiter"]);
    await db
      .delete(jobHiringTeam)
      .where(
        and(
          eq(jobHiringTeam.id, input.id),
          eq(jobHiringTeam.workspaceId, context.organization.id),
        ),
      );
    revalidatePath(`/dashboard/jobs/${input.jobId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to remove member.",
    };
  }
}
