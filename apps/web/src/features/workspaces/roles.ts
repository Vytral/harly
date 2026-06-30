export const workspaceRoles = [
  "owner",
  "admin",
  "recruiter",
  "hiring_manager",
] as const;

export type BuiltinWorkspaceRole = (typeof workspaceRoles)[number];
export type WorkspaceRole = BuiltinWorkspaceRole;
export type WorkspaceRoleKey = string;

export function normalizeWorkspaceRole(
  role: string | null | undefined,
): BuiltinWorkspaceRole {
  if (role && workspaceRoles.includes(role as WorkspaceRole)) {
    return role as WorkspaceRole;
  }

  return "recruiter";
}
