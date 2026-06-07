import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@openhire/db";
import {
  invitation,
  member as authMembers,
  organization as authOrganizations,
  user as authUsers,
  workspaceSettings,
} from "@openhire/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  normalizeWorkspaceRole,
  type WorkspaceRole,
} from "@/features/workspaces/roles";
import {
  normalizeBoardStyle,
  normalizeLogoStyle,
  type BoardStyle,
  type LogoStyle,
} from "@/features/workspaces/board";

export type WorkspaceOption = {
  authOrganizationId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: WorkspaceRole;
  isActive: boolean;
};

export type WorkspaceBranding = {
  name: string;
  slug: string;
  logoUrl: string | null;
  tagline: string | null;
  description: string | null;
  websiteUrl: string | null;
  primaryColor: string | null;
  heroImageUrl: string | null;
  boardStyle: BoardStyle;
  logoStyle: LogoStyle;
};

export type WorkspaceMemberItem = {
  id: string;
  userId: string;
  name: string;
  // Raw role key — built-in ("owner"…) or a custom-role slug.
  role: string;
  email: string;
  isCurrentUser: boolean;
  createdAt: Date;
};

export type WorkspaceInvitationItem = {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  expiresAt: Date;
  createdAt: Date;
};

export async function listUserWorkspaceOptions(): Promise<WorkspaceOption[]> {
  const context = await getWorkspaceContext();

  const rows = await db
    .select({
      authOrganizationId: authOrganizations.id,
      name: authOrganizations.name,
      slug: authOrganizations.slug,
      logoUrl: authOrganizations.logo,
      authRole: authMembers.role,
    })
    .from(authMembers)
    .innerJoin(
      authOrganizations,
      eq(authOrganizations.id, authMembers.organizationId),
    )
    .where(eq(authMembers.userId, context.user.id))
    .orderBy(authOrganizations.name);

  return rows.map((row) => ({
    authOrganizationId: row.authOrganizationId,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logoUrl,
    role: normalizeWorkspaceRole(row.authRole),
    isActive: row.authOrganizationId === context.organization.id,
  }));
}

async function getWorkspaceBranding(
  organizationId: string,
  organization: { name: string; slug: string; logo: string | null },
): Promise<WorkspaceBranding> {
  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, organizationId))
    .limit(1);

  return {
    name: organization.name,
    slug: organization.slug,
    logoUrl: organization.logo,
    tagline: settings?.tagline ?? null,
    description: settings?.description ?? null,
    websiteUrl: settings?.websiteUrl ?? null,
    primaryColor: settings?.primaryColor ?? null,
    heroImageUrl: settings?.heroImageUrl ?? null,
    boardStyle: normalizeBoardStyle(settings?.boardStyle),
    logoStyle: normalizeLogoStyle(settings?.logoStyle),
  };
}

export async function getWorkspaceSettingsData() {
  const context = await getWorkspaceContext();
  const [branding, workspaceOptions, memberRows, invitationRows] =
    await Promise.all([
      getWorkspaceBranding(context.organization.id, context.organization),
      listUserWorkspaceOptions(),
      db
        .select({
          id: authMembers.id,
          userId: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
          role: authMembers.role,
          createdAt: authMembers.createdAt,
        })
        .from(authMembers)
        .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
        .where(eq(authMembers.organizationId, context.organization.id))
        .orderBy(
          sql`case ${authMembers.role} when 'owner' then 0 when 'admin' then 1 when 'recruiter' then 2 else 3 end`,
          authUsers.name,
        ),
      db
        .select({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        })
        .from(invitation)
        .where(eq(invitation.organizationId, context.organization.id))
        .orderBy(desc(invitation.createdAt)),
    ]);

  return {
    context,
    branding,
    workspaceOptions,
    members: memberRows.map((member) => ({
      ...member,
      // Keep the raw role key so custom roles survive (the select resolves names).
      role: member.role,
      isCurrentUser: member.userId === context.user.id,
    })) satisfies WorkspaceMemberItem[],
    invitations: invitationRows.map((item) => ({
      id: item.id,
      email: item.email,
      role: normalizeWorkspaceRole(item.role),
      status: item.status,
      expiresAt: item.expiresAt,
      createdAt: item.createdAt,
    })) satisfies WorkspaceInvitationItem[],
  };
}

export async function getInvitationById(invitationId: string) {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      organizationName: authOrganizations.name,
      organizationSlug: authOrganizations.slug,
      existingAuthUserId: authUsers.id,
    })
    .from(invitation)
    .innerJoin(
      authOrganizations,
      eq(authOrganizations.id, invitation.organizationId),
    )
    .leftJoin(
      authUsers,
      eq(sql`lower(${authUsers.email})`, sql`lower(${invitation.email})`),
    )
    .where(eq(invitation.id, invitationId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...row,
    role: normalizeWorkspaceRole(row.role),
  };
}

export async function getPendingInvitationForEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const [row] = await db
    .select({
      id: invitation.id,
      organizationName: authOrganizations.name,
      organizationSlug: authOrganizations.slug,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .innerJoin(
      authOrganizations,
      eq(authOrganizations.id, invitation.organizationId),
    )
    .where(
      and(
        eq(sql`lower(${invitation.email})`, normalizedEmail),
        eq(invitation.status, "pending"),
      ),
    )
    .orderBy(desc(invitation.createdAt))
    .limit(1);

  return row
    ? {
        ...row,
        role: normalizeWorkspaceRole(row.role),
      }
    : null;
}
