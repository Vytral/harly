import "server-only";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { isDemoMode } from "@harly/config";
import { isLiveSandboxWorkspace } from "@/features/demo/sandbox-state";

import { auth } from "@/lib/auth";
import { db } from "@harly/db";
import {
  member as authMembers,
  organization as authOrganizations,
  user as authUsers,
} from "@harly/db";
import { getMcpActor, type McpActor } from "@/lib/mcp/actor";
import {
  normalizeWorkspaceRole,
  type WorkspaceRole,
  type WorkspaceRoleKey,
} from "@/features/workspaces/roles";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type WorkspaceOrganization = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
};

export type WorkspaceContext = {
  session: Session["session"];
  user: Session["user"];
  organization: WorkspaceOrganization;
  membership: {
    id: string;
    role: WorkspaceRole;
  };
  /** Normalized built-in role (custom keys collapse to "recruiter"). Legacy. */
  role: WorkspaceRole;
  /** Raw membership role key , may be a custom-role slug. Drives permissions. */
  roleKey: WorkspaceRoleKey;
};

type ResolveWorkspaceContextOptions = {
  fallbackToFirstOrganization?: boolean;
};

type ResolvedMembership = {
  organization: WorkspaceOrganization;
  membership: { id: string; role: string };
};

const organizationColumns = {
  organizationId: authOrganizations.id,
  name: authOrganizations.name,
  slug: authOrganizations.slug,
  logo: authOrganizations.logo,
  memberId: authMembers.id,
  role: authMembers.role,
};

function toResolvedMembership(row: {
  organizationId: string;
  name: string;
  slug: string;
  logo: string | null;
  memberId: string;
  role: string;
}): ResolvedMembership {
  return {
    organization: {
      id: row.organizationId,
      name: row.name,
      slug: row.slug,
      logo: row.logo,
    },
    membership: { id: row.memberId, role: row.role },
  };
}

async function getMembershipForOrganization(
  userId: string,
  organizationId: string,
): Promise<ResolvedMembership | null> {
  const [row] = await db
    .select(organizationColumns)
    .from(authMembers)
    .innerJoin(
      authOrganizations,
      eq(authOrganizations.id, authMembers.organizationId),
    )
    .where(
      and(
        eq(authMembers.userId, userId),
        eq(authMembers.organizationId, organizationId),
        eq(authMembers.status, "active"),
      ),
    )
    .limit(1);

  return row ? toResolvedMembership(row) : null;
}

async function getFirstMembership(
  userId: string,
): Promise<ResolvedMembership | null> {
  const [row] = await db
    .select(organizationColumns)
    .from(authMembers)
    .innerJoin(
      authOrganizations,
      eq(authOrganizations.id, authMembers.organizationId),
    )
    .where(and(eq(authMembers.userId, userId), eq(authMembers.status, "active")))
    .orderBy(authOrganizations.name)
    .limit(1);

  return row ? toResolvedMembership(row) : null;
}

/**
 * Context for a verified MCP actor (see lib/mcp/actor.ts). The user must still
 * be an active member of the workspace the token was issued for; a removed or
 * suspended member resolves to null exactly like a signed-out browser. The
 * session object is synthetic: it never matches a row in the session table, so
 * session-management actions cannot be driven through MCP.
 */
async function resolveMcpWorkspaceContext(actor: McpActor): Promise<WorkspaceContext | null> {
  const [resolved, [userRow]] = await Promise.all([
    getMembershipForOrganization(actor.userId, actor.workspaceId),
    db.select().from(authUsers).where(eq(authUsers.id, actor.userId)).limit(1),
  ]);
  if (!resolved || !userRow) return null;
  if (isDemoMode() && !(await isLiveSandboxWorkspace(resolved.organization.id))) {
    return null;
  }
  const now = new Date();
  const role = normalizeWorkspaceRole(resolved.membership.role);
  const session = {
    id: `mcp:${actor.grantId}:${actor.requestId}`,
    token: `mcp:${actor.requestId}`,
    userId: actor.userId,
    activeOrganizationId: actor.workspaceId,
    expiresAt: new Date(now.getTime() + 5 * 60_000),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: `mcp:${actor.clientName}`,
  } as unknown as Session["session"];
  return {
    session,
    user: userRow as unknown as Session["user"],
    organization: resolved.organization,
    membership: { id: resolved.membership.id, role },
    role,
    roleKey: resolved.membership.role,
  };
}

async function resolveWorkspaceContext(
  options: ResolveWorkspaceContextOptions = {},
): Promise<WorkspaceContext | null> {
  const mcpActor = getMcpActor();
  if (mcpActor) return resolveMcpWorkspaceContext(mcpActor);

  const { fallbackToFirstOrganization = true } = options;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return null;
  }

  const resolved =
    (session.session.activeOrganizationId
      ? await getMembershipForOrganization(
          session.user.id,
          session.session.activeOrganizationId,
        )
      : null) ??
    (fallbackToFirstOrganization
      ? await getFirstMembership(session.user.id)
      : null);

  if (!resolved) {
    return null;
  }

  // Public demo: a session only counts while it points at a live per-visitor
  // sandbox. This is the one resolver every page, action and API route goes
  // through, so an expired sandbox or an old shared-account cookie stops
  // working everywhere at once, not just behind a layout redirect.
  if (isDemoMode() && !(await isLiveSandboxWorkspace(resolved.organization.id))) {
    return null;
  }

  const role = normalizeWorkspaceRole(resolved.membership.role);

  return {
    session: session.session,
    user: session.user,
    organization: resolved.organization,
    membership: { id: resolved.membership.id, role },
    role,
    roleKey: resolved.membership.role,
  };
}

export async function getWorkspaceContextOrNull(
  options?: ResolveWorkspaceContextOptions,
) {
  return resolveWorkspaceContext(options);
}

export async function getWorkspaceContext() {
  const mcpActor = getMcpActor();
  if (mcpActor) {
    const context = await resolveMcpWorkspaceContext(mcpActor);
    // No redirects for API callers: the MCP route maps this to an auth error.
    if (!context) throw new Error("MCP actor is no longer a member of this workspace.");
    return context;
  }

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const context = await resolveWorkspaceContext();

  if (!context) {
    redirect((isDemoMode() ? "/enter" : "/onboarding") as Route);
  }

  return context;
}

export async function assertWorkspaceAccess(organizationId: string) {
  const { organization } = await getWorkspaceContext();

  if (organization.id !== organizationId) {
    throw new Error("Workspace access denied.");
  }

  return organization;
}

export async function requireWorkspaceRole(allowedRoles: WorkspaceRole[]) {
  const context = await getWorkspaceContext();

  if (!allowedRoles.includes(context.role)) {
    throw new Error("You do not have permission to perform this action.");
  }

  return context;
}
