export const workspaceRoles = [
  "owner",
  "admin",
  "recruiter",
  "hiring_manager",
] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export function normalizeWorkspaceRole(
  role: string | null | undefined,
): WorkspaceRole {
  if (role && workspaceRoles.includes(role as WorkspaceRole)) {
    return role as WorkspaceRole;
  }

  return "recruiter";
}
