import "server-only";

import { and, eq } from "drizzle-orm";

import {
  db,
  jobHiringTeam,
  member as authMembers,
  user as authUsers,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";

export type HiringTeamRole = "recruiter" | "hiring_manager" | "interviewer";

export type HiringTeamMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image?: string | null;
  username?: string | null;
  role: HiringTeamRole;
};

export type WorkspaceMemberOption = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
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
      image: authUsers.image,
      username: authUsers.username,
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
      image: authUsers.image,
    })
    .from(authMembers)
    .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
    .where(
      and(
        eq(authMembers.organizationId, workspace.id),
        eq(authMembers.status, "active"),
      ),
    )
    .orderBy(authUsers.name);
}
