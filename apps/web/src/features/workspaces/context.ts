import "server-only";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@harly/db";
import {
  member as authMembers,
  organization as authOrganizations,
} from "@harly/db";
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
    .where(eq(authMembers.userId, userId))
    .orderBy(authOrganizations.name)
    .limit(1);

  return row ? toResolvedMembership(row) : null;
}

async function resolveWorkspaceContext(
  options: ResolveWorkspaceContextOptions = {},
): Promise<WorkspaceContext | null> {
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
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const context = await resolveWorkspaceContext();

  if (!context) {
    redirect("/onboarding" as Route);
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
