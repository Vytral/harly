import "server-only";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@harly/db";
import {
  customRoles,
  jobs,
  applications,
  candidates,
  offers,
  interviews,
  jobHiringTeam,
  member as authMembers,
  user as authUsers,
} from "@harly/db";

import {
  getWorkspaceContext,
  type WorkspaceContext,
} from "@/features/workspaces/context";
import {
  BUILTIN_ROLES,
  BUILTIN_ROLE_PERMISSIONS,
  PERMISSIONS,
  exceedsPrivilege,
  isBuiltinRole,
  roleIsAllPowerful,
  roleLabel,
  normalizeRoleScope,
  scopeExceedsPrivilege,
  unrestrictedRoleScope,
  type BuiltinRole,
  type Permission,
  type RoleScope,
} from "@/features/workspaces/permissions";

/**
 * Resolve the permission set for a role key within a workspace.
 *
 * Owner is always all-powerful. For everyone else (built-in or custom), a row
 * in `custom_roles` keyed by the role wins , that's how built-in roles get
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

export type RolePolicy = {
  permissions: Permission[];
  scope: RoleScope;
};

/** Resolve capabilities and tenant-local constraints for a role. */
export async function getRolePolicy(
  workspaceId: string,
  roleKey: string,
): Promise<RolePolicy> {
  if (roleIsAllPowerful(roleKey)) {
    return { permissions: [...PERMISSIONS], scope: unrestrictedRoleScope() };
  }

  const [row] = await db
    .select({ permissions: customRoles.permissions, scope: customRoles.scope })
    .from(customRoles)
    .where(
      and(
        eq(customRoles.workspaceId, workspaceId),
        eq(customRoles.key, roleKey),
      ),
    )
    .limit(1);

  if (row) {
    const rawPermissions = Array.isArray(row.permissions)
      ? (row.permissions as string[])
      : [];
    return {
      permissions: PERMISSIONS.filter((permission) =>
        rawPermissions.includes(permission),
      ),
      scope: normalizeRoleScope(row.scope),
    };
  }

  return {
    permissions: await getRolePermissions(workspaceId, roleKey),
    scope: unrestrictedRoleScope(),
  };
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

/** Require a permission and, for non-admin job members, membership in that job. */
export async function requireJobPermission(
  permission: Permission,
  jobId: string,
) {
  const context = await requirePermission(permission);
  const policy = await getRolePolicy(context.organization.id, context.roleKey);
  const [job] = await db
    .select({
      id: jobs.id,
      department: jobs.department,
      region: jobs.jobLocationRegion,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, context.organization.id),
        eq(jobs.id, jobId),
        isNull(jobs.deletedAt),
      ),
    )
    .limit(1);
  if (!job) throw new Error("Job not found.");

  const matchesScope = (allowed: string[], value: string | null) =>
    allowed.length === 0 ||
    (value
      ? allowed.some(
          (candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase(),
        )
      : false);
  if (
    !matchesScope(policy.scope.departments, job.department) ||
    !matchesScope(policy.scope.regions, job.region)
  ) {
    throw new Error("You do not have access to this job.");
  }
  if (policy.scope.jobAccess === "all") return context;

  const [assignment] = await db
    .select({ id: jobHiringTeam.id })
    .from(jobHiringTeam)
    .where(
      and(
        eq(jobHiringTeam.workspaceId, context.organization.id),
        eq(jobHiringTeam.jobId, jobId),
        eq(jobHiringTeam.userId, context.user.id),
      ),
    )
    .limit(1);

  if (!assignment) throw new Error("You are not assigned to this job.");
  return context;
}

/** Resolve an application to its job, then enforce job-scoped access. */
export async function requireApplicationPermission(
  permission: Permission,
  applicationId: string,
) {
  const context = await requirePermission(permission);

  const [application] = await db
    .select({ jobId: applications.jobId })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, context.organization.id),
        isNull(candidates.deletedAt),
      ),
    )
    .where(
      and(
        eq(applications.workspaceId, context.organization.id),
        eq(applications.id, applicationId),
      ),
    )
    .limit(1);
  if (!application) throw new Error("Application not found.");
  return requireJobPermission(permission, application.jobId);
}

/** Resolve an offer to its application/job, then enforce job-scoped access. */
export async function requireOfferPermission(
  permission: Permission,
  offerId: string,
) {
  const context = await requirePermission(permission);
  const [offer] = await db
    .select({ applicationId: offers.applicationId })
    .from(offers)
    .where(
      and(
        eq(offers.workspaceId, context.organization.id),
        eq(offers.id, offerId),
      ),
    )
    .limit(1);
  if (!offer) throw new Error("Offer not found.");
  return requireApplicationPermission(permission, offer.applicationId);
}

/** Resolve a candidate to one of its applications/jobs, then enforce access. */
export async function requireCandidatePermission(
  permission: Permission,
  candidateId: string,
) {
  const context = await requirePermission(permission);
  const applicationsForCandidate = await db
    .select({ jobId: applications.jobId })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, context.organization.id),
        isNull(candidates.deletedAt),
      ),
    )
    .where(
      and(
        eq(applications.workspaceId, context.organization.id),
        eq(applications.candidateId, candidateId),
      ),
    )
    .limit(100);
  if (applicationsForCandidate.length === 0) {
    throw new Error("Candidate is not assigned to a job.");
  }
  // Candidates can have multiple applications. Access is granted when one
  // related job is inside the actor's contextual scope.
  for (const application of applicationsForCandidate) {
    try {
      return await requireJobPermission(permission, application.jobId);
    } catch {
      // Check the next application without revealing inaccessible job data.
    }
  }
  throw new Error("You do not have access to this candidate.");
}

/** Resolve an interview to its job, then enforce job-scoped access. */
export async function requireInterviewPermission(
  permission: Permission,
  interviewId: string,
) {
  const context = await requirePermission(permission);
  const [interview] = await db
    .select({ jobId: interviews.jobId })
    .from(interviews)
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, interviews.jobId),
        eq(jobs.workspaceId, context.organization.id),
        isNull(jobs.deletedAt),
      ),
    )
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, interviews.candidateId),
        eq(candidates.workspaceId, context.organization.id),
        isNull(candidates.deletedAt),
      ),
    )
    .where(
      and(
        eq(interviews.workspaceId, context.organization.id),
        eq(interviews.id, interviewId),
      ),
    )
    .limit(1);
  if (!interview) throw new Error("Interview not found.");
  return requireJobPermission(permission, interview.jobId);
}

/** Soft check (no throw) , for conditional logic in actions. */
export async function can(permission: Permission): Promise<boolean> {
  const perms = await getCurrentPermissions();
  return perms.includes(permission);
}

/**
 * Page-level guard: redirect to the dashboard unless the current user holds
 * `permission`. Use at the top of server components for settings/admin routes
 * so a recruiter can't reach them by typing the URL , defense in depth on top
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

/**
 * Privilege-ceiling guard for assigning a role to a member (invite, invite
 * link, role change). Returns a user-facing error string, or `null` when the
 * assignment is allowed. Rules for anyone who is not the owner:
 *   - may never grant the all-powerful `owner` role, and
 *   - may only assign a role whose permission set is a subset of their own,
 *     so no one can mint a role more powerful than themselves.
 */
export async function assignRolePrivilegeError(
  context: WorkspaceContext,
  targetRoleKey: string,
): Promise<string | null> {
  if (roleIsAllPowerful(context.roleKey)) return null;
  if (roleIsAllPowerful(targetRoleKey)) {
    return "Only an owner can grant the Owner role.";
  }
  const [actorPolicy, targetPolicy] = await Promise.all([
    getRolePolicy(context.organization.id, context.roleKey),
    getRolePolicy(context.organization.id, targetRoleKey),
  ]);
  if (exceedsPrivilege(actorPolicy.permissions, targetPolicy.permissions)) {
    return "You can't assign a role with more access than your own.";
  }
  if (scopeExceedsPrivilege(actorPolicy.scope, targetPolicy.scope)) {
    return "You can't assign a role with a broader scope than your own.";
  }
  return null;
}

/**
 * Privilege-ceiling guard for editing a role's permission set (create/update
 * custom or built-in override). Returns a user-facing error string, or `null`
 * when allowed. A non-owner can never grant a permission they don't hold
 * themselves , this closes self-escalation via `roles:manage`.
 */
export async function grantPermissionsPrivilegeError(
  context: WorkspaceContext,
  permissions: readonly Permission[],
): Promise<string | null> {
  if (roleIsAllPowerful(context.roleKey)) return null;
  const actorPerms = await getRolePermissions(
    context.organization.id,
    context.roleKey,
  );
  if (exceedsPrivilege(actorPerms, permissions)) {
    return "You can't grant permissions you don't have yourself.";
  }
  return null;
}

export async function grantRolePolicyPrivilegeError(
  context: WorkspaceContext,
  permissions: readonly Permission[],
  scope: RoleScope,
): Promise<string | null> {
  const permissionError = await grantPermissionsPrivilegeError(context, permissions);
  if (permissionError) return permissionError;
  if (roleIsAllPowerful(context.roleKey)) return null;
  const actorPolicy = await getRolePolicy(context.organization.id, context.roleKey);
  return scopeExceedsPrivilege(actorPolicy.scope, scope)
    ? "You can't grant a role with a broader scope than your own."
    : null;
}

export type WorkspaceRoleMember = {
  id: string;
  name: string;
  image?: string | null;
};

export type WorkspaceRoleSummary = {
  key: string;
  name: string;
  permissions: Permission[];
  scope: RoleScope;
  isBuiltin: boolean;
  /** Owner is the locked keyholder , full access, never editable. */
  isOwner: boolean;
  editable: boolean;
  memberCount: number;
  members: WorkspaceRoleMember[];
};

/** All assignable roles (built-in + custom) with member counts, for settings. */
export async function listWorkspaceRoles(): Promise<WorkspaceRoleSummary[]> {
  const { organization } = await getWorkspaceContext();

  const [rows, memberRows] = await Promise.all([
    db
      .select({
        key: customRoles.key,
        name: customRoles.name,
        permissions: customRoles.permissions,
        scope: customRoles.scope,
      })
      .from(customRoles)
      .where(eq(customRoles.workspaceId, organization.id))
      .orderBy(customRoles.name),
    db
      .select({
        id: authMembers.id,
        role: authMembers.role,
        name: authUsers.name,
        image: authUsers.image,
      })
      .from(authMembers)
      .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
      .where(eq(authMembers.organizationId, organization.id)),
  ]);

  const membersByRole = new Map<string, WorkspaceRoleMember[]>();
  const counts = new Map<string, number>();
  for (const m of memberRows) {
    counts.set(m.role, (counts.get(m.role) ?? 0) + 1);
    const list = membersByRole.get(m.role) ?? [];
    list.push({ id: m.id, name: m.name, image: m.image });
    membersByRole.set(m.role, list);
  }

  const overrides = new Map(rows.map((r) => [r.key, r]));
  const filterPerms = (raw: unknown) =>
    PERMISSIONS.filter((p) =>
      (Array.isArray(raw) ? (raw as string[]) : []).includes(p),
    );

  // Built-in roles , overridable except owner.
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
      scope:
        key === "owner"
          ? unrestrictedRoleScope()
          : override
            ? normalizeRoleScope(override.scope)
            : unrestrictedRoleScope(),
      isBuiltin: true,
      isOwner: key === "owner",
      editable: key !== "owner",
      memberCount: counts.get(key) ?? 0,
      members: membersByRole.get(key) ?? [],
    };
  });

  // Custom roles , rows whose key isn't a built-in.
  const customSummaries: WorkspaceRoleSummary[] = rows
    .filter((row) => !isBuiltinRole(row.key))
    .map((row) => ({
      key: row.key,
      name: row.name,
      permissions: filterPerms(row.permissions),
      scope: normalizeRoleScope(row.scope),
      isBuiltin: false,
      isOwner: false,
      editable: true,
      memberCount: counts.get(row.key) ?? 0,
      members: membersByRole.get(row.key) ?? [],
    }));

  return [...builtin, ...customSummaries];
}
