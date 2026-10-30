import "server-only";

import { ApiError } from "@harly/api";

import { getWorkspaceContext, type WorkspaceContext } from "@/features/workspaces/context";
import { getRolePolicy } from "@/features/workspaces/permissions-server";
import type { Permission } from "@/features/workspaces/permissions";
import type { WorkspaceSearchActor } from "@/features/search/scope";

export type DsarExportAccess = {
  context: WorkspaceContext;
  /** The caller and their role scope, for scoping candidate-specific reads. */
  actor: WorkspaceSearchActor;
};

/**
 * Gate for sensitive consent, audit and candidate-data exports. Requires the
 * `dsar:manage` permission, resolved the same way as `requirePermission`
 * (owner is all-powerful; everyone else uses their role's stored or default set).
 * `alsoRequire` adds a second permission (the audit-log export also needs
 * `security:manage`, the permission that opens the Security page).
 * Throws `ApiError.forbidden` with the caller's message so route handlers can
 * map it to their existing 403 response shape.
 */
export async function requireDsarExport(
  message: string,
  options: { alsoRequire?: Permission } = {},
): Promise<DsarExportAccess> {
  const context = await getWorkspaceContext();
  const policy = await getRolePolicy(context.organization.id, context.roleKey);
  const required: Permission[] = ["dsar:manage", ...(options.alsoRequire ? [options.alsoRequire] : [])];
  if (!required.every((permission) => policy.permissions.includes(permission))) {
    throw ApiError.forbidden(message);
  }
  return {
    context,
    actor: {
      workspaceId: context.organization.id,
      userId: context.user.id,
      permissions: policy.permissions,
      scope: policy.scope,
    },
  };
}
