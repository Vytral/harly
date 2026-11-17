import "server-only";

import { and, eq } from "drizzle-orm";

import { ApiError } from "@harly/api";
import { customRoles, db, member } from "@harly/db";

import { isUnrestrictedScope } from "@/features/search/scope";
import {
  builtinRoleDefaultScope,
  builtinRoleScope,
  roleIsAllPowerful,
} from "@/features/workspaces/permissions";

/**
 * Resolve the user id to attribute API-initiated writes to. Records like jobs
 * require a non-null `createdById`; an API key isn't a user, so we attribute to
 * the key's creator when they're still a member, otherwise to a workspace owner.
 */
export async function resolveWorkspaceActorUserId(
  workspaceId: string,
  preferredUserId?: string | null,
): Promise<string | null> {
  if (preferredUserId) {
    const [membership] = await db
      .select({ userId: member.userId })
      .from(member)
      .where(
        and(
          eq(member.organizationId, workspaceId),
          eq(member.userId, preferredUserId),
        ),
      )
      .limit(1);
    if (membership) return membership.userId;
  }

  const [owner] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(eq(member.organizationId, workspaceId), eq(member.role, "owner")),
    )
    .limit(1);

  return owner?.userId ?? null;
}

/**
 * Workspace-wide reads (activity feed, reports) are only for callers whose role
 * is not limited to specific jobs. An API key acts with the scope of the member
 * who created it, so a key minted by a job-scoped recruiter cannot widen it.
 */
export async function requireUnrestrictedKeyScope(
  workspaceId: string,
  createdById: string | null,
): Promise<void> {
  const deny = () =>
    ApiError.forbidden(
      "This endpoint is workspace-wide and needs a key created by a member whose role is not limited to specific jobs.",
    );
  if (!createdById) throw deny();
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, workspaceId),
        eq(member.userId, createdById),
        eq(member.status, "active"),
      ),
    )
    .limit(1);
  if (!membership) throw deny();
  if (roleIsAllPowerful(membership.role)) return;

  const [custom] = await db
    .select({ scope: customRoles.scope })
    .from(customRoles)
    .where(
      and(
        eq(customRoles.workspaceId, workspaceId),
        eq(customRoles.key, membership.role),
      ),
    )
    .limit(1);
  const scope = custom
    ? builtinRoleScope(membership.role, custom.scope)
    : builtinRoleDefaultScope(membership.role);
  if (!isUnrestrictedScope(scope)) throw deny();
}
