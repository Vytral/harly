import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@harly/db";
import {
  invitation,
  member as authMembers,
  memberSenderIdentity,
  organization as authOrganizations,
  user as authUsers,
  workspaceSettings,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getWorkspaceEmailStatus } from "@/lib/email/config";
import {
  extractDomain,
  hasCustomSendingDomain,
} from "@/lib/email/sender-identity";
import {
  normalizeWorkspaceRole,
  type WorkspaceRole,
  type WorkspaceRoleKey,
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
  sidebarLogoStyle: LogoStyle;
  sidebarLogoUrl?: string | null;
  sidebarLogoDarkUrl?: string | null;
  hideHarlyBranding: boolean;
};

export type SidebarBranding = {
  style: LogoStyle;
  lightUrl: string | null;
  darkUrl: string | null;
};

export type WorkspaceMemberItem = {
  id: string;
  userId: string;
  name: string;
  // Raw role key , built-in ("owner"…) or a custom-role slug.
  role: string;
  email: string;
  image?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  location?: string | null;
  bio?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  isCurrentUser: boolean;
  createdAt: Date;
  senderLocalPart: string | null;
  senderDisplayName: string | null;
};

/** Whether/where per-recruiter virtual sender identities are active for this
 * workspace , gated on a custom sending domain being configured. */
export type WorkspaceEmailIdentityStatus = {
  enabled: boolean;
  domain: string | null;
};

export type WorkspaceInvitationItem = {
  id: string;
  email: string;
  role: WorkspaceRoleKey;
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
    sidebarLogoStyle: normalizeLogoStyle(settings?.sidebarLogoStyle),
    sidebarLogoUrl: settings?.sidebarLogoUrl ?? null,
    sidebarLogoDarkUrl: settings?.sidebarLogoDarkUrl ?? null,
    hideHarlyBranding: settings?.hideHarlyBranding ?? false,
  };
}

export async function getSidebarBranding(
  organizationId: string,
): Promise<SidebarBranding> {
  const [settings] = await db
    .select({
      sidebarLogoStyle: workspaceSettings.sidebarLogoStyle,
      sidebarLogoUrl: workspaceSettings.sidebarLogoUrl,
      sidebarLogoDarkUrl: workspaceSettings.sidebarLogoDarkUrl,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, organizationId))
    .limit(1);

  return {
    style: normalizeLogoStyle(settings?.sidebarLogoStyle),
    lightUrl: settings?.sidebarLogoUrl ?? null,
    darkUrl: settings?.sidebarLogoDarkUrl ?? null,
  };
}


export async function getWorkspaceSettingsData() {
  const context = await getWorkspaceContext();
  const [branding, workspaceOptions, memberRows, invitationRows, settingsRow, emailStatus] =
    await Promise.all([
      getWorkspaceBranding(context.organization.id, context.organization),
      listUserWorkspaceOptions(),
      db
        .select({
          id: authMembers.id,
          userId: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
          image: authUsers.image,
          jobTitle: authUsers.jobTitle,
          phone: authUsers.phone,
          location: authUsers.location,
          bio: authUsers.bio,
          linkedinUrl: authUsers.linkedinUrl,
          githubUrl: authUsers.githubUrl,
          websiteUrl: authUsers.websiteUrl,
          role: authMembers.role,
          createdAt: authMembers.createdAt,
          senderLocalPart: memberSenderIdentity.localPart,
          senderDisplayName: memberSenderIdentity.displayName,
        })
        .from(authMembers)
        .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
        .leftJoin(
          memberSenderIdentity,
          eq(memberSenderIdentity.memberId, authMembers.id),
        )
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
      db
        .select({
          token: workspaceSettings.inviteLinkToken,
          role: workspaceSettings.inviteLinkRole,
          enabled: workspaceSettings.inviteLinkEnabled,
        })
        .from(workspaceSettings)
        .where(eq(workspaceSettings.organizationId, context.organization.id))
        .limit(1),
      getWorkspaceEmailStatus(context.organization.id),
    ]);

  const emailIdentity: WorkspaceEmailIdentityStatus = {
    enabled: hasCustomSendingDomain(emailStatus),
    domain: extractDomain(emailStatus.from),
  };

  return {
    context,
    branding,
    workspaceOptions,
    emailIdentity,
    inviteLink: {
      token: settingsRow[0]?.token ?? null,
      role: settingsRow[0]?.role ?? "recruiter",
      enabled: settingsRow[0]?.enabled ?? false,
    },
    members: memberRows.map((member) => ({
      ...member,
      // Keep the raw role key so custom roles survive (the select resolves names).
      role: member.role,
      isCurrentUser: member.userId === context.user.id,
    })) satisfies WorkspaceMemberItem[],
    invitations: invitationRows.map((item) => ({
      id: item.id,
      email: item.email,
      role: item.role ?? "recruiter",
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
      organizationLogo: authOrganizations.logo,
      existingAuthUserId: authUsers.id,
      inviterId: invitation.inviterId,
      inviterName: authUsers.name,
      inviterImage: authUsers.image,
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

  // Fetch inviter details separately
  const [inviter] = await db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      image: authUsers.image,
    })
    .from(authUsers)
    .where(eq(authUsers.id, row.inviterId))
    .limit(1);

  return {
    ...row,
    role: row.role ?? "recruiter",
    inviter: inviter ?? null,
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
        role: row.role ?? "recruiter",
      }
    : null;
}

/**
 * Resolve a workspace from a shareable invite-link token. Returns null when the
 * token is unknown or the link is disabled. Used by the public /join/[token]
 * landing page.
 */
export async function getWorkspaceByInviteToken(token: string) {
  const cleaned = token.trim();
  if (!cleaned) return null;

  const [row] = await db
    .select({
      organizationId: workspaceSettings.organizationId,
      role: workspaceSettings.inviteLinkRole,
      enabled: workspaceSettings.inviteLinkEnabled,
      name: authOrganizations.name,
      logo: authOrganizations.logo,
    })
    .from(workspaceSettings)
    .innerJoin(
      authOrganizations,
      eq(authOrganizations.id, workspaceSettings.organizationId),
    )
    .where(eq(workspaceSettings.inviteLinkToken, cleaned))
    .limit(1);

  if (!row || !row.enabled) return null;

  return {
    organizationId: row.organizationId,
    organizationName: row.name,
    organizationLogo: row.logo,
    role: row.role ?? "recruiter",
  };
}
