import "server-only";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@harly/db";
import { customRoles, member as authMembers } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  BUILTIN_ROLES,
  BUILTIN_ROLE_PERMISSIONS,
  PERMISSIONS,
  isBuiltinRole,
  roleIsAllPowerful,
  roleLabel,
  type BuiltinRole,
  type Permission,
} from "@/features/workspaces/permissions";

/**
 * Resolve the permission set for a role key within a workspace.
 *
 * Owner is always all-powerful. For everyone else (built-in or custom), a row
 * in `custom_roles` keyed by the role wins — that's how built-in roles get
 * tuned. With no override, built-ins fall back to their code defaults.
 */
export async function getRolePermissions(
  workspaceId: string,
  roleKey: string,
): Promise<Permission[]> {
  if (roleIsAllPowerful(roleKey)) {
    return [...PERMISSIONS];
  }

  const [row] = await db
    .select({ permissions: customRoles.permissions })
    .from(customRoles)
    .where(
      and(
        eq(customRoles.workspaceId, workspaceId),
        eq(customRoles.key, roleKey),
      ),
    )
    .limit(1);

  if (row) {
    const perms = Array.isArray(row.permissions)
      ? (row.permissions as string[])
      : [];
    return PERMISSIONS.filter((p) => perms.includes(p));
  }

  if (isBuiltinRole(roleKey)) {
    return [...BUILTIN_ROLE_PERMISSIONS[roleKey as BuiltinRole]];
  }

  return [];
}

/** Permission set for the current user in the active workspace. */
export async function getCurrentPermissions(): Promise<Permission[]> {
  const { organization, roleKey } = await getWorkspaceContext();
  return getRolePermissions(organization.id, roleKey);
}

/**
 * Throw unless the current user holds `permission`. Returns the workspace
 * context so callers can reuse it. Owners/admins always pass.
 */
export async function requirePermission(permission: Permission) {
  const context = await getWorkspaceContext();
  if (roleIsAllPowerful(context.roleKey)) {
    return context;
  }
  const perms = await getRolePermissions(
    context.organization.id,
    context.roleKey,
  );
  if (!perms.includes(permission)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return context;
}

/** Soft check (no throw) — for conditional logic in actions. */
export async function can(permission: Permission): Promise<boolean> {
  const perms = await getCurrentPermissions();
  return perms.includes(permission);
}

/**
 * Page-level guard: redirect to the dashboard unless the current user holds
 * `permission`. Use at the top of server components for settings/admin routes
 * so a recruiter can't reach them by typing the URL — defense in depth on top
 * of the per-action `requirePermission` checks.
 */
export async function requirePagePermission(permission: Permission) {
  const context = await getWorkspaceContext();
  if (roleIsAllPowerful(context.roleKey)) return context;
  const perms = await getRolePermissions(
    context.organization.id,
    context.roleKey,
  );
  if (!perms.includes(permission)) {
    redirect("/dashboard" as Route);
  }
  return context;
}

export type WorkspaceRoleSummary = {
  key: string;
  name: string;
  permissions: Permission[];
  isBuiltin: boolean;
  /** Owner is the locked keyholder — full access, never editable. */
  isOwner: boolean;
  editable: boolean;
  memberCount: number;
};

/** All assignable roles (built-in + custom) with member counts, for settings. */
export async function listWorkspaceRoles(): Promise<WorkspaceRoleSummary[]> {
  const { organization } = await getWorkspaceContext();

  const [rows, members] = await Promise.all([
    db
      .select({
        key: customRoles.key,
        name: customRoles.name,
        permissions: customRoles.permissions,
      })
      .from(customRoles)
      .where(eq(customRoles.workspaceId, organization.id))
      .orderBy(customRoles.name),
    db
      .select({ role: authMembers.role })
      .from(authMembers)
      .where(eq(authMembers.organizationId, organization.id)),
  ]);

  const counts = new Map<string, number>();
  for (const m of members) {
    counts.set(m.role, (counts.get(m.role) ?? 0) + 1);
  }

  const overrides = new Map(rows.map((r) => [r.key, r]));
  const filterPerms = (raw: unknown) =>
    PERMISSIONS.filter((p) =>
      (Array.isArray(raw) ? (raw as string[]) : []).includes(p),
    );

  // Built-in roles — overridable except owner.
  const builtin: WorkspaceRoleSummary[] = BUILTIN_ROLES.map((key) => {
    const override = overrides.get(key);
    return {
      key,
      name: roleLabel(key),
      permissions:
        key === "owner"
          ? [...PERMISSIONS]
          : override
            ? filterPerms(override.permissions)
            : [...BUILTIN_ROLE_PERMISSIONS[key]],
      isBuiltin: true,
      isOwner: key === "owner",
      editable: key !== "owner",
      memberCount: counts.get(key) ?? 0,
    };
  });

  // Custom roles — rows whose key isn't a built-in.
  const customSummaries: WorkspaceRoleSummary[] = rows
    .filter((row) => !isBuiltinRole(row.key))
    .map((row) => ({
      key: row.key,
      name: row.name,
      permissions: filterPerms(row.permissions),
      isBuiltin: false,
      isOwner: false,
      editable: true,
      memberCount: counts.get(row.key) ?? 0,
    }));

  return [...builtin, ...customSummaries];
}
