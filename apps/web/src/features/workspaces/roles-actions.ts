"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit-log";

import { db } from "@harly/db";
import { customRoles, member as authMembers } from "@harly/db";

import {
  grantPermissionsPrivilegeError,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import {
  PERMISSIONS,
  isBuiltinRole,
  roleLabel,
} from "@/features/workspaces/permissions";
import { createLogger } from "@/lib/logger";
import { slugify } from "@/lib/utils";

const log = createLogger("workspace-roles");

export type RoleActionResult = { ok: boolean; error?: string };

const permissionEnum = z.enum(PERMISSIONS);

const roleSchema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(40),
  permissions: z.array(permissionEnum).max(PERMISSIONS.length),
});

export async function createCustomRole(input: {
  name: string;
  permissions: string[];
}): Promise<RoleActionResult> {
  const context = await requirePermission("roles:manage");

  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid role." };
  }

  const privilegeError = await grantPermissionsPrivilegeError(
    context,
    parsed.data.permissions,
  );
  if (privilegeError) {
    return { ok: false, error: privilegeError };
  }

  const key = slugify(parsed.data.name);
  if (!key) {
    return { ok: false, error: "Enter a valid role name." };
  }
  if (isBuiltinRole(key)) {
    return { ok: false, error: "That name collides with a built-in role." };
  }

  try {
    await db.insert(customRoles).values({
      workspaceId: context.organization.id,
      key,
      name: parsed.data.name,
      permissions: parsed.data.permissions,
    });
  } catch (error) {
    log.error(error, "createCustomRole failed");
    return { ok: false, error: "A role with that name already exists." };
  }

  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "role.created",
    severity: "warning",
    metadata: { key, name: parsed.data.name },
  });

  revalidatePath("/settings/members");
  return { ok: true };
}

export async function updateCustomRole(input: {
  key: string;
  name: string;
  permissions: string[];
}): Promise<RoleActionResult> {
  const context = await requirePermission("roles:manage");

  // Owner is the locked keyholder — never editable.
  if (input.key === "owner") {
    return { ok: false, error: "The Owner role can't be edited." };
  }
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid role." };
  }

  const privilegeError = await grantPermissionsPrivilegeError(
    context,
    parsed.data.permissions,
  );
  if (privilegeError) {
    return { ok: false, error: privilegeError };
  }

  const builtin = isBuiltinRole(input.key);
  // Built-in names are fixed; only their permissions are tunable (stored as an
  // override row). Custom roles keep their editable name.
  const name = builtin ? roleLabel(input.key) : parsed.data.name;

  // Upsert: a built-in's first edit creates its override row; later edits update.
  await db
    .insert(customRoles)
    .values({
      workspaceId: context.organization.id,
      key: input.key,
      name,
      permissions: parsed.data.permissions,
    })
    .onConflictDoUpdate({
      target: [customRoles.workspaceId, customRoles.key],
      set: { name, permissions: parsed.data.permissions, updatedAt: new Date() },
    });

  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "role.updated",
    severity: "warning",
    metadata: { key: input.key, name, permissions: parsed.data.permissions },
  });

  revalidatePath("/settings/members");
  return { ok: true };
}

export async function deleteCustomRole(input: {
  key: string;
}): Promise<RoleActionResult> {
  const context = await requirePermission("roles:manage");

  if (isBuiltinRole(input.key)) {
    return { ok: false, error: "Built-in roles can't be deleted." };
  }

  await db.transaction(async (tx) => {
    // Re-home anyone holding this role so no member is left with a dangling role.
    await tx
      .update(authMembers)
      .set({ role: "recruiter" })
      .where(
        and(
          eq(authMembers.organizationId, context.organization.id),
          eq(authMembers.role, input.key),
        ),
      );
    await tx
      .delete(customRoles)
      .where(
        and(
          eq(customRoles.workspaceId, context.organization.id),
          eq(customRoles.key, input.key),
        ),
      );
  });

  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "role.deleted",
    severity: "critical",
    metadata: { key: input.key },
  });

  revalidatePath("/settings/members");
  return { ok: true };
}
