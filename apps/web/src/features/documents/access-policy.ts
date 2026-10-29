export type DocumentAccessLevel = "read" | "manage";

export function resolveDocumentAccessLevel(input: {
  ownerId: string | null;
  userId: string;
  roleKey: string;
  memberRules: Array<{
    userId: string;
    accessLevel: DocumentAccessLevel;
  }>;
  roleRules: Array<{
    roleKey: string;
    accessLevel: DocumentAccessLevel;
  }>;
}): DocumentAccessLevel | null {
  if (
    input.roleKey === "owner" ||
    input.roleKey === "admin" ||
    input.ownerId === input.userId
  ) {
    return "manage";
  }

  const memberRule = input.memberRules.find(
    (rule) => rule.userId === input.userId,
  );
  const roleRule = input.roleRules.find(
    (rule) => rule.roleKey === input.roleKey,
  );
  const accessLevel = memberRule?.accessLevel ?? roleRule?.accessLevel;
  if (accessLevel) return accessLevel;

  const hasExplicitAcl =
    input.memberRules.length > 0 || input.roleRules.length > 0;
  return hasExplicitAcl ? null : "read";
}

/**
 * Whether the viewer's access comes from ownership, an admin role, or an
 * explicit ACL rule that names them. Access that exists only because the
 * document has no ACL at all (the workspace-wide default) is not explicit.
 */
export function documentAccessIsExplicit(input: {
  ownerId: string | null;
  userId: string;
  roleKey: string;
  memberRules: Array<{ userId: string }>;
  roleRules: Array<{ roleKey: string }>;
}): boolean {
  if (
    input.roleKey === "owner" ||
    input.roleKey === "admin" ||
    input.ownerId === input.userId
  ) {
    return true;
  }
  return (
    input.memberRules.some((rule) => rule.userId === input.userId) ||
    input.roleRules.some((rule) => rule.roleKey === input.roleKey)
  );
}
