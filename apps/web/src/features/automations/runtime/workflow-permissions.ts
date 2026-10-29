import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import {
  applications,
  candidates,
  customRoles,
  db,
  jobHiringTeam,
  jobs,
  member as authMembers,
} from "@harly/db";

import { isUnrestrictedScope, jobVisibleUnderScope } from "@/features/search/scope";
import {
  BUILTIN_ROLE_PERMISSIONS,
  PERMISSIONS,
  isBuiltinRole,
  normalizeRoleScope,
  roleIsAllPowerful,
  unrestrictedRoleScope,
  type BuiltinRole,
  type RoleScope,
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

/**
 * Job-scope check for an automation acting on an application, run as the
 * workflow creator. Mirrors requireApplicationPermission for the UI: a role
 * limited by department, region or assignment may not move or re-status an
 * application on a job outside that limit. Reuses the search scope rules.
 */
export async function actorCanActOnApplication(
  database: typeof db,
  workspaceId: string,
  actorUserId: string,
  applicationId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [membership] = await database
    .select({ role: authMembers.role })
    .from(authMembers)
    .where(and(eq(authMembers.organizationId, workspaceId), eq(authMembers.userId, actorUserId)))
    .limit(1);
  if (!membership) return { ok: false, reason: "Workflow creator no longer has workspace access." };
  if (roleIsAllPowerful(membership.role)) return { ok: true };

  const [custom] = await database
    .select({ scope: customRoles.scope })
    .from(customRoles)
    .where(and(eq(customRoles.workspaceId, workspaceId), eq(customRoles.key, membership.role)))
    .limit(1);
  const scope: RoleScope = custom ? normalizeRoleScope(custom.scope) : unrestrictedRoleScope();
  if (isUnrestrictedScope(scope)) return { ok: true };

  const [target] = await database
    .select({
      jobId: applications.jobId,
      department: jobs.department,
      region: jobs.jobLocationRegion,
    })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt)),
    )
    .where(and(eq(applications.workspaceId, workspaceId), eq(applications.id, applicationId)))
    .limit(1);
  if (!target) return { ok: false, reason: "Application not found." };

  const [assignment] = await database
    .select({ id: jobHiringTeam.id })
    .from(jobHiringTeam)
    .where(
      and(
        eq(jobHiringTeam.workspaceId, workspaceId),
        eq(jobHiringTeam.jobId, target.jobId),
        eq(jobHiringTeam.userId, actorUserId),
      ),
    )
    .limit(1);

  if (!jobVisibleUnderScope(scope, { department: target.department, region: target.region }, Boolean(assignment))) {
    return {
      ok: false,
      reason: "Workflow creator's role is not allowed to act on this application's job.",
    };
  }
  return { ok: true };
}
