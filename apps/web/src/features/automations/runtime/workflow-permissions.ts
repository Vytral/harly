import "server-only";

import { and, eq } from "drizzle-orm";
import { customRoles, db, member as authMembers } from "@harly/db";

import {
  BUILTIN_ROLE_PERMISSIONS,
  PERMISSIONS,
  isBuiltinRole,
  roleIsAllPowerful,
  type BuiltinRole,
} from "@/features/workspaces/permissions";

/** Runtime-only actor check without importing session/auth configuration. */
export async function actorHasPermission(
  database: typeof db,
  workspaceId: string,
  actorUserId: string,
  permission: string,
): Promise<{ ok: boolean; reason?: string }> {
  const [membership] = await database
    .select({ role: authMembers.role })
    .from(authMembers)
    .where(and(eq(authMembers.organizationId, workspaceId), eq(authMembers.userId, actorUserId)))
    .limit(1);

  if (!membership) return { ok: false, reason: "Workflow actor no longer has workspace access." };
  if (roleIsAllPowerful(membership.role)) return { ok: true };

  const [custom] = await database
    .select({ permissions: customRoles.permissions })
    .from(customRoles)
    .where(and(eq(customRoles.workspaceId, workspaceId), eq(customRoles.key, membership.role)))
    .limit(1);
  const permissions = custom
    ? PERMISSIONS.filter((item) => Array.isArray(custom.permissions) && (custom.permissions as string[]).includes(item))
    : isBuiltinRole(membership.role)
      ? BUILTIN_ROLE_PERMISSIONS[membership.role as BuiltinRole]
      : [];
  return permissions.includes(permission as never)
    ? { ok: true }
    : { ok: false, reason: `Workflow actor lacks permission: ${permission}.` };
}
