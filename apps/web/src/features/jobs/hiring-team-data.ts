import "server-only";

import { and, eq } from "drizzle-orm";

import {
  db,
  jobHiringTeam,
  member as authMembers,
  user as authUsers,
} from "@openhire/db";
import { getWorkspaceContext } from "@/features/workspaces/context";

export type HiringTeamRole = "recruiter" | "hiring_manager" | "interviewer";

export type HiringTeamMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: HiringTeamRole;
};

export type WorkspaceMemberOption = {
  userId: string;
  name: string;
  email: string;
};

export async function listJobHiringTeam(
  jobId: string,
): Promise<HiringTeamMember[]> {
  const { organization: workspace } = await getWorkspaceContext();

  return db
    .select({
      id: jobHiringTeam.id,
      userId: jobHiringTeam.userId,
      role: jobHiringTeam.role,
      name: authUsers.name,
      email: authUsers.email,
    })
    .from(jobHiringTeam)
    .innerJoin(authUsers, eq(authUsers.id, jobHiringTeam.userId))
    .where(
      and(
        eq(jobHiringTeam.workspaceId, workspace.id),
        eq(jobHiringTeam.jobId, jobId),
      ),
    )
    .orderBy(authUsers.name);
}

export async function listWorkspaceMembers(): Promise<WorkspaceMemberOption[]> {
  const { organization: workspace } = await getWorkspaceContext();

  return db
    .select({
      userId: authMembers.userId,
      name: authUsers.name,
      email: authUsers.email,
    })
    .from(authMembers)
    .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
    .where(eq(authMembers.organizationId, workspace.id))
    .orderBy(authUsers.name);
}
