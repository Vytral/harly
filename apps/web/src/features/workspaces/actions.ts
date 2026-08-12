"use server";

import crypto from "node:crypto";
import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { logAuditEvent } from "@/lib/audit-log";
import { sendWorkspaceEmail } from "@/lib/email";
import { getWorkspaceEmailBranding } from "@/lib/email/branding";
import { createLogger } from "@/lib/logger";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { db } from "@harly/db";
import { convertAndStoreLogo } from "@/lib/logo-convert";
import {
  account as authAccounts,
  customRoles,
  invitation,
  member as authMembers,
  organization as authOrganizations,
  session as authSessions,
  user as authUsers,
  workspaceSettings,
} from "@harly/db";
import { isBuiltinRole } from "@/features/workspaces/permissions";
import { provisionMemberSenderIdentity } from "@/features/workspaces/sender-identity";
import {
  WelcomeEmail,
  WorkspaceInvitation,
  workspaceInvitationSubject,
} from "@harly/emails";
import {
  getWorkspaceContext,
} from "@/features/workspaces/context";
import {
  assignRolePrivilegeError,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import {
  boardBrandingSchema,
  boardStyles,
  logoStyles,
} from "@/features/workspaces/board";

type ActionResult = {
  success: boolean;
  error?: string;
  organizationId?: string;
};

// Role may be a built-in key OR a workspace custom-role key , validated at
// runtime against the workspace via isAssignableRole().
const inviteMemberSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: z.string().trim().min(1),
});

const updateMemberRoleSchema = z.object({
  memberId: z.string().trim().min(1),
  role: z.string().trim().min(1),
});

const updateMemberAccessSchema = z.object({
  memberId: z.string().trim().min(1),
  department: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  team: z.string().trim().max(120).optional().nullable(),
  managerMemberId: z.string().trim().min(1).optional().nullable(),
  status: z.enum(["active", "inactive", "suspended"]),
});

async function isAssignableRole(
  organizationId: string,
  role: string,
): Promise<boolean> {
  if (isBuiltinRole(role)) return true;
  const [row] = await db
    .select({ id: customRoles.id })
    .from(customRoles)
    .where(
      and(
        eq(customRoles.workspaceId, organizationId),
        eq(customRoles.key, role),
      ),
    )
    .limit(1);
  return Boolean(row);
}

const removeMemberSchema = z.object({
  memberId: z.string().trim().min(1),
});

// Accept an absolute http(s) URL or a locally-uploaded /uploads/... path;
// empty → null so clearing an upload persists.
const optionalUploadUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .refine(
    (value) =>
      value === null ||
      value.startsWith("/uploads/") ||
      /^https?:\/\//.test(value),
    "Logo must be a valid URL.",
  );


const workspaceProfileSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required.").max(120),
  // Accept an absolute http(s) URL or a locally-uploaded /uploads/... path.
  logoUrl: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : ""))
    .refine(
      (value) =>
        value === "" ||
        value.startsWith("/uploads/") ||
        /^https?:\/\//.test(value),
      "Logo must be a valid URL.",
    ),
    sidebarLogoStyle: z.enum(logoStyles).default("bordered"),
    sidebarLogoUrl: optionalUploadUrl,
    sidebarLogoDarkUrl: optionalUploadUrl,
});

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

async function getAuthUserByEmail(email: string) {
  const [authUser] = await db
    .select()
    .from(authUsers)
    .where(eq(sql`lower(${authUsers.email})`, email.trim().toLowerCase()))
    .limit(1);

  return authUser ?? null;
}

async function countOwners(organizationId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(authMembers)
    .where(
      and(
        eq(authMembers.organizationId, organizationId),
        eq(authMembers.role, "owner"),
      ),
    );

  return row?.count ?? 0;
}

function isOwnerRole(role: string) {
  return role === "owner";
}

// Sacred rule: invitations and shareable links never mint owners. The Owner
// role is only reachable by promoting an existing member (updateMemberRoles),
// which an owner does deliberately , guarding against a fat-finger invite.
const INVITE_OWNER_BLOCKED =
  "The Owner role can't be assigned by invite. Invite as another role, then promote from the members list.";

const log = createLogger("workspaces");

export async function updateWorkspaceBoardBrandingAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const context = await requirePermission("settings:edit");
    const rawBoardStyle = formData.get("boardStyle");
    const rawLogoStyle = formData.get("logoStyle");
    const parsed = boardBrandingSchema.safeParse({
      tagline: formData.get("tagline") ?? undefined,
      description: formData.get("description") ?? undefined,
      websiteUrl: formData.get("websiteUrl") ?? undefined,
      primaryColor: formData.get("primaryColor") ?? undefined,
      heroImageUrl: formData.get("heroImageUrl") ?? undefined,
      boardStyle:
        typeof rawBoardStyle === "string" &&
        boardStyles.includes(rawBoardStyle as (typeof boardStyles)[number])
          ? rawBoardStyle
          : undefined,
      logoStyle:
        typeof rawLogoStyle === "string" &&
        logoStyles.includes(rawLogoStyle as (typeof logoStyles)[number])
          ? rawLogoStyle
          : undefined,
      hideHarlyBranding: formData.get("hideHarlyBranding") === "true",
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid board branding.",
      };
    }

    const values = {
      tagline: parsed.data.tagline,
      description: parsed.data.description,
      websiteUrl: parsed.data.websiteUrl,
      primaryColor: parsed.data.primaryColor,
      heroImageUrl: parsed.data.heroImageUrl,
      boardStyle: parsed.data.boardStyle,
      logoStyle: parsed.data.logoStyle,
      hideHarlyBranding: parsed.data.hideHarlyBranding,
    };

    await db
      .insert(workspaceSettings)
      .values({
        organizationId: context.organization.id,
        ...values,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: {
          ...values,
          updatedAt: new Date(),
        },
      });

    revalidatePath("/settings");
    revalidatePath(`/board/${context.organization.slug}`);
    return { success: true };
  } catch (error) {
    log.error(error, "updateWorkspaceBoardBrandingAction failed");
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to update board branding.",
    };
  }
}

export async function updateWorkspaceProfileAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const context = await requirePermission("settings:edit");
    const rawSidebarLogoStyle = formData.get("sidebarLogoStyle");
    const parsed = workspaceProfileSchema.safeParse({
      name: formData.get("name"),
      logoUrl: formData.get("logoUrl"),
      sidebarLogoStyle:
        typeof rawSidebarLogoStyle === "string" &&
        logoStyles.includes(rawSidebarLogoStyle as (typeof logoStyles)[number])
          ? rawSidebarLogoStyle
          : undefined,
      sidebarLogoUrl: formData.get("sidebarLogoUrl"),
      sidebarLogoDarkUrl: formData.get("sidebarLogoDarkUrl"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid workspace profile.",
      };
    }

    await db
      .update(authOrganizations)
      .set({
        name: parsed.data.name,
        logo: parsed.data.logoUrl || null,
      })
      .where(eq(authOrganizations.id, context.organization.id));

    // Convert logo for email compatibility if a new logo was uploaded
    if (parsed.data.logoUrl) {
      try {
        await convertAndStoreLogo({
          organizationId: context.organization.id,
          logoUrl: parsed.data.logoUrl,
          storage,
        });
      } catch (error) {
        // Log but don't fail the profile update
        console.error("[Workspace] Failed to convert logo for email:", error);
      }
    }
    
    await db
      .insert(workspaceSettings)
      .values({
        organizationId: context.organization.id,
        sidebarLogoStyle: parsed.data.sidebarLogoStyle,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: {
          sidebarLogoStyle: parsed.data.sidebarLogoStyle,
          updatedAt: new Date(),
        },
      });

    // Sidebar wordmark config lives in workspace_settings (upsert).
    const sidebarValues = {
      sidebarLogoStyle: parsed.data.sidebarLogoStyle ?? "bordered",
      sidebarLogoUrl: parsed.data.sidebarLogoUrl || null,
      sidebarLogoDarkUrl: parsed.data.sidebarLogoDarkUrl || null,
    };
    await db
      .insert(workspaceSettings)
      .values({ organizationId: context.organization.id, ...sidebarValues })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: { ...sidebarValues, updatedAt: new Date() },
      });

    revalidatePath("/settings");
    revalidatePath("/dashboard");

    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "settings.profile_updated",
      severity: "info",
      metadata: { name: parsed.data.name },
    });

    return { success: true };
  } catch (error) {
    log.error(error, "updateWorkspaceProfileAction failed");
    return {
      success: false,
      error:
        "Unable to update workspace.",
    };
  }
}

type InviteContext = {
  organization: { id: string; name: string };
  user: { id: string; name: string; email: string };
};

type InviteOneResult =
  | { ok: true; outcome: "added" | "invited" }
  | { ok: false; reason: string };

/**
 * Core invite logic for a single (email, role). Caller must have already
 * authorized the actor. Does NOT revalidate , callers revalidate once.
 * Existing user → added to the org immediately. New user → pending invitation
 * + email. Role is assumed already validated as assignable.
 */
async function inviteOneMember(
  context: InviteContext,
  email: string,
  role: string,
): Promise<InviteOneResult> {
  const appUrl = getHarlyPublicOrigin();
  const authUser = await getAuthUserByEmail(email);

  if (authUser) {
    // A `user` row surviving with no active membership means they were
    // removed before , this workspace is the only org they could ever have
    // belonged to. Re-adding them is silent by default; without an email
    // they'd have no idea access came back.
    const [existingMembership] = await db
      .select({ id: authMembers.id })
      .from(authMembers)
      .where(
        and(
          eq(authMembers.organizationId, context.organization.id),
          eq(authMembers.userId, authUser.id),
        ),
      )
      .limit(1);

    const memberId = crypto.randomUUID();
    await db
      .insert(authMembers)
      .values({
        id: memberId,
        organizationId: context.organization.id,
        userId: authUser.id,
        role,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .update(authMembers)
      .set({ role })
      .where(
        and(
          eq(authMembers.organizationId, context.organization.id),
          eq(authMembers.userId, authUser.id),
        ),
      );

    await provisionMemberSenderIdentity(db, {
      organizationId: context.organization.id,
      memberId: existingMembership?.id ?? memberId,
      userId: authUser.id,
      name: authUser.name,
    });

    await db
      .update(invitation)
      .set({ status: "accepted" })
      .where(
        and(
          eq(invitation.organizationId, context.organization.id),
          eq(sql`lower(${invitation.email})`, email),
          eq(invitation.status, "pending"),
        ),
      );

    if (!existingMembership) {
      const branding = await getWorkspaceEmailBranding(context.organization.id);
      void sendWorkspaceEmail(context.organization.id, {
        to: email,
        subject: `You've been added back to ${context.organization.name}`,
        react: createElement(WelcomeEmail, {
          userName: authUser.name,
          workspaceName: context.organization.name,
          dashboardUrl: `${appUrl}/login`,
          branding,
        }),
      });
    }

    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "member.invited",
      severity: "info",
      metadata: { email, role },
    });
    return { ok: true, outcome: "added" };
  }

  const [existingInvitation] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, context.organization.id),
        eq(sql`lower(${invitation.email})`, email),
        eq(invitation.status, "pending"),
      ),
    )
    .limit(1);

  if (existingInvitation) {
    return { ok: false, reason: "Already has a pending invitation." };
  }

  const invitationId = crypto.randomUUID();
  await db.insert(invitation).values({
    id: invitationId,
    organizationId: context.organization.id,
    email,
    role,
    status: "pending",
    expiresAt: addDays(new Date(), 7),
    inviterId: context.user.id,
  });

  const acceptUrl = `${appUrl}/invite/${invitationId}`;
  const branding = await getWorkspaceEmailBranding(context.organization.id);

  void sendWorkspaceEmail(context.organization.id, {
    to: email,
    subject: workspaceInvitationSubject({
      inviterName: context.user.name,
      workspaceName: context.organization.name,
    }),
    react: createElement(WorkspaceInvitation, {
      inviteeName: email.split("@")[0],
      inviterName: context.user.name,
      workspaceName: context.organization.name,
      role,
      acceptUrl,
      branding,
    }),
  });

  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "member.invited",
    severity: "info",
    metadata: { email, role },
  });
  return { ok: true, outcome: "invited" };
}

export async function inviteWorkspaceMemberAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const context = await requirePermission("members:invite");
    const parsed = inviteMemberSchema.safeParse({
      email: formData.get("email"),
      role: formData.get("role"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid invitation.",
      };
    }

    if (isOwnerRole(parsed.data.role)) {
      return { success: false, error: INVITE_OWNER_BLOCKED };
    }

    if (!(await isAssignableRole(context.organization.id, parsed.data.role))) {
      return { success: false, error: "Unknown role." };
    }

    const privilegeError = await assignRolePrivilegeError(
      context,
      parsed.data.role,
    );
    if (privilegeError) {
      return { success: false, error: privilegeError };
    }

    const result = await inviteOneMember(
      context,
      parsed.data.email,
      parsed.data.role,
    );
    if (!result.ok) {
      return { success: false, error: result.reason };
    }
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    log.error(error, "inviteWorkspaceMemberAction failed");
    return {
      success: false,
      error: "Unable to invite member.",
    };
  }
}

const bulkInviteSchema = z.object({
  invites: z
    .array(
      z.object({
        email: z
          .email()
          .trim()
          .transform((value) => value.toLowerCase()),
        role: z.string().trim().min(1),
      }),
    )
    .min(1, "Add at least one email.")
    .max(100, "Up to 100 invites at a time."),
});

export type BulkInviteResult = {
  success: boolean;
  error?: string;
  sent?: number;
  added?: number;
  skipped?: { email: string; reason: string }[];
};

export async function inviteWorkspaceMembersAction(
  _previousState: BulkInviteResult,
  formData: FormData,
): Promise<BulkInviteResult> {
  try {
    const context = await requirePermission("members:invite");

    const raw = formData.get("invites");
    let payload: unknown;
    try {
      payload = JSON.parse(typeof raw === "string" ? raw : "[]");
    } catch {
      return { success: false, error: "Invalid invite data." };
    }

    const parsed = bulkInviteSchema.safeParse({ invites: payload });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid invites.",
      };
    }

    // Dedupe by email (last role wins), skip blanks.
    const byEmail = new Map<string, string>();
    for (const row of parsed.data.invites) {
      byEmail.set(row.email, row.role);
    }

    const skipped: { email: string; reason: string }[] = [];
    let sent = 0;
    let added = 0;

    for (const [email, role] of byEmail) {
      if (isOwnerRole(role)) {
        skipped.push({ email, reason: INVITE_OWNER_BLOCKED });
        continue;
      }
      if (!(await isAssignableRole(context.organization.id, role))) {
        skipped.push({ email, reason: "Unknown role." });
        continue;
      }
      const privilegeError = await assignRolePrivilegeError(context, role);
      if (privilegeError) {
        skipped.push({ email, reason: privilegeError });
        continue;
      }
      const result = await inviteOneMember(context, email, role);
      if (!result.ok) {
        skipped.push({ email, reason: result.reason });
      } else if (result.outcome === "added") {
        added += 1;
      } else {
        sent += 1;
      }
    }

    revalidatePath("/settings");
    return { success: true, sent, added, skipped };
  } catch (error) {
    log.error(error, "inviteWorkspaceMembersAction failed");
    return { success: false, error: "Unable to send invites." };
  }
}


export async function updateWorkspaceMemberRoleAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const context = await requirePermission("members:edit");
    const parsed = updateMemberRoleSchema.safeParse({
      memberId: formData.get("memberId"),
      role: formData.get("role"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid role update.",
      };
    }

    if (!(await isAssignableRole(context.organization.id, parsed.data.role))) {
      return { success: false, error: "Unknown role." };
    }

    const privilegeError = await assignRolePrivilegeError(
      context,
      parsed.data.role,
    );
    if (privilegeError) {
      return { success: false, error: privilegeError };
    }

    const [targetMember] = await db
      .select({
        id: authMembers.id,
        role: authMembers.role,
      })
      .from(authMembers)
      .where(
        and(
          eq(authMembers.id, parsed.data.memberId),
          eq(authMembers.organizationId, context.organization.id),
        ),
      )
      .limit(1);

    if (!targetMember) {
      return { success: false, error: "Member not found." };
    }

    // Only an owner may modify another owner's role , stops a non-owner from
    // demoting or hijacking the workspace's keyholders.
    if (
      isOwnerRole(targetMember.role) &&
      !isOwnerRole(context.roleKey)
    ) {
      return {
        success: false,
        error: "Only an owner can change an owner's role.",
      };
    }

    // Consistent with the bulk action: you can't strip your own Owner role.
    if (
      targetMember.id === context.membership.id &&
      isOwnerRole(targetMember.role) &&
      parsed.data.role !== "owner"
    ) {
      return { success: false, error: "You can't remove your own Owner role." };
    }

    if (
      isOwnerRole(targetMember.role) &&
      parsed.data.role !== "owner" &&
      (await countOwners(context.organization.id)) <= 1
    ) {
      return { success: false, error: "Workspace must keep at least one owner." };
    }

    await db
      .update(authMembers)
      .set({ role: parsed.data.role })
      .where(eq(authMembers.id, parsed.data.memberId));

    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "member.role_changed",
      resourceType: "member",
      resourceId: parsed.data.memberId,
      severity: "warning",
      metadata: { newRole: parsed.data.role },
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    log.error(error, "updateWorkspaceMemberRoleAction failed");
    return {
      success: false,
      error: "Unable to update member.",
    };
  }
}

const bulkRolesSchema = z.object({
  changes: z
    .array(
      z.object({
        memberId: z.string().trim().min(1),
        role: z.string().trim().min(1),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * Apply many member-role changes at once (one global "Save changes" instead of
 * a button per row). Guards the owner invariant: a workspace keeps ≥1 owner and
 * you can't strip your own Owner role.
 */
export async function updateMemberRolesAction(input: {
  changes: { memberId: string; role: string }[];
}): Promise<ActionResult> {
  try {
    const context = await requirePermission("members:edit");
    const parsed = bulkRolesSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid changes." };
    }

    for (const change of parsed.data.changes) {
      if (!(await isAssignableRole(context.organization.id, change.role))) {
        return { success: false, error: "Unknown role." };
      }
      const privilegeError = await assignRolePrivilegeError(
        context,
        change.role,
      );
      if (privilegeError) {
        return { success: false, error: privilegeError };
      }
    }

    const ids = parsed.data.changes.map((c) => c.memberId);
    const targets = await db
      .select({ id: authMembers.id, role: authMembers.role })
      .from(authMembers)
      .where(
        and(
          eq(authMembers.organizationId, context.organization.id),
          inArray(authMembers.id, ids),
        ),
      );
    const byId = new Map(targets.map((t) => [t.id, t]));

    let ownersAfter = await countOwners(context.organization.id);
    for (const change of parsed.data.changes) {
      const target = byId.get(change.memberId);
      if (!target) {
        return { success: false, error: "Member not found." };
      }
      const wasOwner = target.role === "owner";
      const willOwner = change.role === "owner";
      // Only an owner may modify another owner's role.
      if (wasOwner && !isOwnerRole(context.roleKey)) {
        return {
          success: false,
          error: "Only an owner can change an owner's role.",
        };
      }
      if (target.id === context.membership.id && wasOwner && !willOwner) {
        return { success: false, error: "You can't remove your own Owner role." };
      }
      if (wasOwner && !willOwner) ownersAfter -= 1;
      if (!wasOwner && willOwner) ownersAfter += 1;
    }
    if (ownersAfter < 1) {
      return { success: false, error: "Workspace must keep at least one owner." };
    }

    await db.transaction(async (tx) => {
      for (const change of parsed.data.changes) {
        const target = byId.get(change.memberId);
        if (!target || target.role === change.role) continue;
        await tx
          .update(authMembers)
          .set({ role: change.role })
          .where(eq(authMembers.id, change.memberId));
      }
    });

    revalidatePath("/settings/members");
    return { success: true };
  } catch (error) {
    log.error(error, "updateMemberRolesAction failed");
    return {
      success: false,
      error: "Unable to update roles.",
    };
  }
}

export async function updateMemberAccessAction(input: {
  memberId: string;
  department?: string | null;
  region?: string | null;
  team?: string | null;
  managerMemberId?: string | null;
  status: "active" | "inactive" | "suspended";
}): Promise<ActionResult> {
  try {
    const context = await requirePermission("members:edit");
    const parsed = updateMemberAccessSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid member access profile." };
    const [target] = await db.select({ id: authMembers.id, userId: authMembers.userId, role: authMembers.role }).from(authMembers).where(and(eq(authMembers.id, parsed.data.memberId), eq(authMembers.organizationId, context.organization.id))).limit(1);
    if (!target) return { success: false, error: "Member not found." };
    if (target.userId === context.user.id && parsed.data.status !== "active") return { success: false, error: "You cannot deactivate your own membership." };
    if (isOwnerRole(target.role) && parsed.data.status !== "active" && !isOwnerRole(context.roleKey)) return { success: false, error: "Only an owner can suspend an owner." };
    const managerMemberId = parsed.data.managerMemberId ?? null;
    if (managerMemberId) {
      if (managerMemberId === target.id) return { success: false, error: "A member cannot manage themselves." };
      const [manager] = await db.select({ id: authMembers.id }).from(authMembers).where(and(eq(authMembers.id, managerMemberId), eq(authMembers.organizationId, context.organization.id), eq(authMembers.status, "active"))).limit(1);
      if (!manager) return { success: false, error: "Manager must be an active member of this workspace." };
    }
    await db.update(authMembers).set({ department: parsed.data.department?.trim() || null, region: parsed.data.region?.trim() || null, team: parsed.data.team?.trim() || null, managerMemberId, status: parsed.data.status, updatedAt: new Date() }).where(eq(authMembers.id, target.id));
    if (parsed.data.status !== "active") await db.delete(authSessions).where(eq(authSessions.userId, target.userId));
    await logAuditEvent({ workspaceId: context.organization.id, actorId: context.user.id, actorEmail: context.user.email, action: "member.access_profile_changed", resourceType: "member", resourceId: target.id, severity: parsed.data.status === "active" ? "info" : "warning", metadata: { department: parsed.data.department ?? null, region: parsed.data.region ?? null, team: parsed.data.team ?? null, managerMemberId, status: parsed.data.status } });
    revalidatePath("/settings/members");
    return { success: true };
  } catch (error) {
    log.error(error, "updateMemberAccessAction failed");
    return { success: false, error: "Unable to update member access." };
  }
}

export async function removeWorkspaceMemberAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const context = await requirePermission("members:remove");
    const parsed = removeMemberSchema.safeParse({
      memberId: formData.get("memberId"),
    });

    if (!parsed.success) {
      return { success: false, error: "Invalid member." };
    }

    const [targetMember] = await db
      .select({
        id: authMembers.id,
        userId: authMembers.userId,
        role: authMembers.role,
      })
      .from(authMembers)
      .where(
        and(
          eq(authMembers.id, parsed.data.memberId),
          eq(authMembers.organizationId, context.organization.id),
        ),
      )
      .limit(1);

    if (!targetMember) {
      return { success: false, error: "Member not found." };
    }

    if (targetMember.userId === context.user.id) {
      return { success: false, error: "You cannot remove yourself." };
    }

    if (isOwnerRole(targetMember.role) && !isOwnerRole(context.roleKey)) {
      return { success: false, error: "Only an owner can remove an owner." };
    }

    if (
      isOwnerRole(targetMember.role) &&
      (await countOwners(context.organization.id)) <= 1
    ) {
      return { success: false, error: "Workspace must keep at least one owner." };
    }

    await db.delete(authMembers).where(eq(authMembers.id, targetMember.id));

    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "member.removed",
      resourceType: "member",
      resourceId: targetMember.id,
      severity: "warning",
      metadata: { userId: targetMember.userId, role: targetMember.role },
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    log.error(error, "removeWorkspaceMemberAction failed");
    return {
      success: false,
      error: "Unable to remove member.",
    };
  }
}

/** Resend a pending invitation email and push its expiry out another 7 days. */
export async function resendWorkspaceInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  try {
    const context = await requirePermission("members:invite");
    const appUrl = getHarlyPublicOrigin();

    const [invite] = await db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.id, invitationId),
          eq(invitation.organizationId, context.organization.id),
          eq(invitation.status, "pending"),
        ),
      )
      .limit(1);

    if (!invite) {
      return { success: false, error: "Invitation not found." };
    }

    await db
      .update(invitation)
      .set({ expiresAt: addDays(new Date(), 7) })
      .where(eq(invitation.id, invite.id));

    const acceptUrl = `${appUrl}/invite/${invite.id}`;
    const branding = await getWorkspaceEmailBranding(context.organization.id);

    void sendWorkspaceEmail(context.organization.id, {
      to: invite.email,
      subject: workspaceInvitationSubject({
        inviterName: context.user.name,
        workspaceName: context.organization.name,
      }),
      react: createElement(WorkspaceInvitation, {
        inviteeName: invite.email.split("@")[0],
        inviterName: context.user.name,
        workspaceName: context.organization.name,
        role: invite.role ?? "recruiter",
        acceptUrl,
        branding,
      }),
    });

    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "member.invitation_resent",
      severity: "info",
      metadata: { invitationId: invite.id, email: invite.email },
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    log.error(error, "resendWorkspaceInvitationAction failed");
    return { success: false, error: "Unable to resend invitation." };
  }
}

export async function cancelWorkspaceInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  try {
    const context = await requirePermission("members:invite");

    await db
      .update(invitation)
      .set({ status: "canceled" })
      .where(
        and(
          eq(invitation.id, invitationId),
          eq(invitation.organizationId, context.organization.id),
          eq(invitation.status, "pending"),
        ),
      );

    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "member.invitation_canceled",
      severity: "info",
      metadata: { invitationId },
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    log.error(error, "cancelWorkspaceInvitationAction failed");
    return {
      success: false,
      error:
        "Unable to cancel invitation.",
    };
  }
}

export async function acceptWorkspaceInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session) {
      return { success: false, error: "You must sign in first." };
    }

    const normalizedEmail = session.user.email.trim().toLowerCase();

    const result = await db.transaction<ActionResult>(async (tx) => {
      const [targetInvitation] = await tx
        .select({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          organizationId: invitation.organizationId,
        })
        .from(invitation)
        .where(eq(invitation.id, invitationId))
        .limit(1);

      if (!targetInvitation) {
        return { success: false, error: "Invitation not found." };
      }

      if (targetInvitation.status !== "pending") {
        return { success: false, error: "Invitation is no longer pending." };
      }

      if (targetInvitation.expiresAt < new Date()) {
        return { success: false, error: "Invitation has expired." };
      }

      if (targetInvitation.email.trim().toLowerCase() !== normalizedEmail) {
        return {
          success: false,
          error: "This invitation belongs to a different email.",
        };
      }

      const role = targetInvitation.role ?? "recruiter";

      if (!(await isAssignableRole(targetInvitation.organizationId, role))) {
        return { success: false, error: "This invitation points to a role that no longer exists." };
      }

      const memberId = crypto.randomUUID();
      await tx
        .insert(authMembers)
        .values({
          id: memberId,
          organizationId: targetInvitation.organizationId,
          userId: session.user.id,
          role,
          createdAt: new Date(),
        })
        .onConflictDoNothing();

      await tx
        .update(authMembers)
        .set({ role })
        .where(
          and(
            eq(authMembers.organizationId, targetInvitation.organizationId),
            eq(authMembers.userId, session.user.id),
          ),
        );

      const [acceptedMember] = await tx
        .select({ id: authMembers.id })
        .from(authMembers)
        .where(
          and(
            eq(authMembers.organizationId, targetInvitation.organizationId),
            eq(authMembers.userId, session.user.id),
          ),
        )
        .limit(1);

      await provisionMemberSenderIdentity(tx, {
        organizationId: targetInvitation.organizationId,
        memberId: acceptedMember?.id ?? memberId,
        userId: session.user.id,
        name: session.user.name,
      });

      await tx
        .update(invitation)
        .set({ status: "accepted" })
        .where(eq(invitation.id, targetInvitation.id));

      await tx
        .update(authSessions)
        .set({
          activeOrganizationId: targetInvitation.organizationId,
          updatedAt: new Date(),
        })
        .where(eq(authSessions.token, session.session.token));

      return {
        success: true,
        organizationId: targetInvitation.organizationId,
      };
    });

    revalidatePath("/dashboard");
    revalidatePath("/settings");
    return result;
  } catch (error) {
    log.error(error, "acceptWorkspaceInvitationAction failed");
    return {
      success: false,
      error:
        "Unable to accept invitation.",
    };
  }
}

export async function leaveWorkspaceAction(): Promise<ActionResult> {
  try {
    const context = await getWorkspaceContext();

    if (
      context.role === "owner" &&
      (await countOwners(context.organization.id)) <= 1
    ) {
      return { success: false, error: "Workspace must keep at least one owner." };
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(authMembers)
        .where(
          and(
            eq(authMembers.organizationId, context.organization.id),
            eq(authMembers.userId, context.user.id),
          ),
        );

      await tx
        .update(authSessions)
        .set({
          activeOrganizationId: null,
          updatedAt: new Date(),
        })
        .where(eq(authSessions.token, context.session.token));
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    log.error(error, "leaveWorkspaceAction failed");
    return {
      success: false,
      error: "Unable to leave workspace.",
    };
  }
}

// ── Shareable invite link ──────────────────────────────────────────────────
// Anyone with the token can join the workspace with the configured role. The
// token is a random url-safe id stored on workspace_settings; rotating it
// invalidates every previously shared URL.

type InviteLinkResult = {
  success: boolean;
  error?: string;
  token?: string | null;
  enabled?: boolean;
  role?: string;
};

async function readInviteLink(organizationId: string) {
  const [row] = await db
    .select({
      token: workspaceSettings.inviteLinkToken,
      role: workspaceSettings.inviteLinkRole,
      enabled: workspaceSettings.inviteLinkEnabled,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

const inviteLinkRoleSchema = z.object({ role: z.string().trim().min(1) });

/** Enable (and mint a token if missing) the shareable invite link. */
export async function enableInviteLinkAction(
  _previousState: InviteLinkResult,
  formData: FormData,
): Promise<InviteLinkResult> {
  try {
    const context = await requirePermission("invite_links:manage");

    const parsed = inviteLinkRoleSchema.safeParse({ role: formData.get("role") });
    if (!parsed.success) {
      return { success: false, error: "Invalid role." };
    }
    if (isOwnerRole(parsed.data.role)) {
      return { success: false, error: INVITE_OWNER_BLOCKED };
    }
    if (!(await isAssignableRole(context.organization.id, parsed.data.role))) {
      return { success: false, error: "Unknown role." };
    }

    const privilegeError = await assignRolePrivilegeError(
      context,
      parsed.data.role,
    );
    if (privilegeError) {
      return { success: false, error: privilegeError };
    }

    const existing = await readInviteLink(context.organization.id);
    const token = existing?.token ?? crypto.randomBytes(18).toString("base64url");

    await db
      .insert(workspaceSettings)
      .values({
        organizationId: context.organization.id,
        inviteLinkToken: token,
        inviteLinkRole: parsed.data.role,
        inviteLinkEnabled: true,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: {
          inviteLinkToken: token,
          inviteLinkRole: parsed.data.role,
          inviteLinkEnabled: true,
          updatedAt: new Date(),
        },
      });

    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "member.invited",
      severity: "info",
      metadata: { inviteLink: "enabled", role: parsed.data.role },
    });
    revalidatePath("/settings");
    return { success: true, token, enabled: true, role: parsed.data.role };
  } catch (error) {
    log.error(error, "enableInviteLinkAction failed");
    return { success: false, error: "Unable to update invite link." };
  }
}

/** Disable the shareable link (keeps the token so re-enabling reuses it). */
export async function disableInviteLinkAction(): Promise<InviteLinkResult> {
  try {
    const context = await requirePermission("invite_links:manage");
    await db
      .insert(workspaceSettings)
      .values({
        organizationId: context.organization.id,
        inviteLinkEnabled: false,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: { inviteLinkEnabled: false, updatedAt: new Date() },
      });
    revalidatePath("/settings");
    return { success: true, enabled: false };
  } catch (error) {
    log.error(error, "disableInviteLinkAction failed");
    return { success: false, error: "Unable to disable invite link." };
  }
}

/** Mint a fresh token, invalidating all previously shared URLs. */
export async function rotateInviteLinkAction(): Promise<InviteLinkResult> {
  try {
    const context = await requirePermission("invite_links:manage");
    const token = crypto.randomBytes(18).toString("base64url");
    await db
      .insert(workspaceSettings)
      .values({
        organizationId: context.organization.id,
        inviteLinkToken: token,
        inviteLinkEnabled: true,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: {
          inviteLinkToken: token,
          inviteLinkEnabled: true,
          updatedAt: new Date(),
        },
      });
    revalidatePath("/settings");
    return { success: true, token, enabled: true };
  } catch (error) {
    log.error(error, "rotateInviteLinkAction failed");
    return { success: false, error: "Unable to rotate invite link." };
  }
}

/** Accept a shareable invite link: current session joins with the link role. */
export async function joinViaInviteLinkAction(
  token: string,
): Promise<ActionResult> {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) {
      return { success: false, error: "You must sign in first." };
    }

    const cleaned = token.trim();
    if (!cleaned) {
      return { success: false, error: "Invalid invite link." };
    }

    const [ws] = await db
      .select({
        organizationId: workspaceSettings.organizationId,
        role: workspaceSettings.inviteLinkRole,
        enabled: workspaceSettings.inviteLinkEnabled,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.inviteLinkToken, cleaned))
      .limit(1);

    if (!ws || !ws.enabled) {
      return { success: false, error: "This invite link is no longer active." };
    }

    const role = ws.role ?? "recruiter";
    if (!(await isAssignableRole(ws.organizationId, role))) {
      return { success: false, error: "This invite link points to a role that no longer exists." };
    }

    const joinedMemberId = crypto.randomUUID();
    await db
      .insert(authMembers)
      .values({
        id: joinedMemberId,
        organizationId: ws.organizationId,
        userId: session.user.id,
        role,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    const [joinedMember] = await db
      .select({ id: authMembers.id })
      .from(authMembers)
      .where(
        and(
          eq(authMembers.organizationId, ws.organizationId),
          eq(authMembers.userId, session.user.id),
        ),
      )
      .limit(1);

    await provisionMemberSenderIdentity(db, {
      organizationId: ws.organizationId,
      memberId: joinedMember?.id ?? joinedMemberId,
      userId: session.user.id,
      name: session.user.name,
    });

    await logAuditEvent({
      workspaceId: ws.organizationId,
      actorId: session.user.id,
      actorEmail: session.user.email,
      action: "member.invited",
      severity: "info",
      metadata: { via: "invite_link", role },
    });

    return { success: true, organizationId: ws.organizationId };
  } catch (error) {
    log.error(error, "joinViaInviteLinkAction failed");
    return { success: false, error: "Unable to join workspace." };
  }
}

// ─── Owner-only member account management ─────────────────────────────────────
// Resetting a password or editing another person's profile is a high-trust
// action, so it is gated strictly on the built-in owner role (never a grantable
// permission) to avoid an admin or custom role escalating into account takeover.

const setMemberPasswordSchema = z.object({
  memberId: z.string().trim().min(1),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const editMemberProfileSchema = z.object({
  memberId: z.string().trim().min(1),
  name: z.string().trim().min(1, "Name is required.").max(120),
  jobTitle: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(60).optional(),
  location: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2000).optional(),
  linkedinUrl: z.string().trim().max(2048).optional(),
  githubUrl: z.string().trim().max(2048).optional(),
  websiteUrl: z.string().trim().max(2048).optional(),
  email: z.string().trim().email("Enter a valid email.").max(320),
});

/** Resolve the target member within the actor's workspace, enforcing that the
 *  actor is an owner. Returns the member's userId or an error result. */
async function requireOwnerActingOnMember(
  memberId: string,
): Promise<
  | { ok: true; workspaceId: string; actorId: string; targetUserId: string; targetRole: string }
  | { ok: false; error: string }
> {
  const context = await getWorkspaceContext();
  if (!isOwnerRole(context.roleKey)) {
    return { ok: false, error: "Only the workspace owner can do this." };
  }

  const [target] = await db
    .select({ userId: authMembers.userId, role: authMembers.role })
    .from(authMembers)
    .where(
      and(
        eq(authMembers.id, memberId),
        eq(authMembers.organizationId, context.organization.id),
      ),
    )
    .limit(1);

  if (!target) return { ok: false, error: "Member not found." };

  return {
    ok: true,
    workspaceId: context.organization.id,
    actorId: context.user.id,
    targetUserId: target.userId,
    targetRole: target.role,
  };
}

export async function setMemberPasswordAction(input: {
  memberId: string;
  password: string;
}): Promise<ActionResult> {
  try {
    const parsed = setMemberPasswordSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid password.",
      };
    }

    const resolved = await requireOwnerActingOnMember(parsed.data.memberId);
    if (!resolved.ok) return { success: false, error: resolved.error };

    if (resolved.targetUserId === resolved.actorId) {
      return {
        success: false,
        error: "Use your account settings to change your own password.",
      };
    }

    const { hashPassword } = await import("better-auth/crypto");
    const passwordHash = await hashPassword(parsed.data.password);

    // Update the credential account, or create one if the member only ever
    // signed in via OAuth/passkey and has no password yet.
    const [credential] = await db
      .select({ id: authAccounts.id })
      .from(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, resolved.targetUserId),
          eq(authAccounts.providerId, "credential"),
        ),
      )
      .limit(1);

    if (credential) {
      await db
        .update(authAccounts)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(authAccounts.id, credential.id));
    } else {
      await db.insert(authAccounts).values({
        id: crypto.randomUUID(),
        accountId: resolved.targetUserId,
        providerId: "credential",
        userId: resolved.targetUserId,
        password: passwordHash,
      });
    }

    // Force re-authentication everywhere: existing sessions must not survive an
    // owner-initiated password change.
    await db
      .delete(authSessions)
      .where(eq(authSessions.userId, resolved.targetUserId));

    await logAuditEvent({
      workspaceId: resolved.workspaceId,
      actorId: resolved.actorId,
      action: "member.password_reset",
      resourceType: "member",
      resourceId: parsed.data.memberId,
      severity: "warning",
      metadata: { targetUserId: resolved.targetUserId },
    });

    revalidatePath("/settings/members");
    return { success: true };
  } catch (error) {
    log.error(error, "setMemberPasswordAction failed");
    return { success: false, error: "Unable to reset password." };
  }
}

export async function editMemberProfileAction(input: {
  memberId: string;
  name: string;
  jobTitle?: string;
  phone?: string;
  location?: string;
  bio?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  email: string;
}): Promise<ActionResult> {
  try {
    const parsed = editMemberProfileSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid profile.",
      };
    }

    const resolved = await requireOwnerActingOnMember(parsed.data.memberId);
    if (!resolved.ok) return { success: false, error: resolved.error };

    const nextEmail = parsed.data.email.toLowerCase();

    // Email is a login credential: guard uniqueness before writing.
    const [current] = await db
      .select({ email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, resolved.targetUserId))
      .limit(1);

    const emailChanged = Boolean(
      current && current.email.toLowerCase() !== nextEmail,
    );

    if (emailChanged) {
      const [clash] = await db
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(eq(authUsers.email, nextEmail))
        .limit(1);
      if (clash && clash.id !== resolved.targetUserId) {
        return { success: false, error: "That email is already in use." };
      }
    }

    await db
      .update(authUsers)
      .set({
        name: parsed.data.name,
        email: nextEmail,
        // A new login email starts unverified.
        ...(emailChanged ? { emailVerified: false } : {}),
        jobTitle: parsed.data.jobTitle || null,
        phone: parsed.data.phone || null,
        location: parsed.data.location || null,
        bio: parsed.data.bio || null,
        linkedinUrl: parsed.data.linkedinUrl || null,
        githubUrl: parsed.data.githubUrl || null,
        websiteUrl: parsed.data.websiteUrl || null,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, resolved.targetUserId));

    await logAuditEvent({
      workspaceId: resolved.workspaceId,
      actorId: resolved.actorId,
      action: "member.profile_edited",
      resourceType: "member",
      resourceId: parsed.data.memberId,
      severity: "info",
      metadata: {
        targetUserId: resolved.targetUserId,
        emailChanged,
      },
    });

    revalidatePath("/settings/members");
    return { success: true };
  } catch (error) {
    log.error(error, "editMemberProfileAction failed");
    return { success: false, error: "Unable to update profile." };
  }
}

const createMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z.string().trim().email("Enter a valid email.").max(320),
  role: z.string().trim().min(1),
  password: z.string().min(8, "Password must be at least 8 characters."),
  image: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  jobTitle: z.string().trim().max(120).optional(),
});

/**
 * Owner-only: provision a member account directly (no invite email). The owner
 * sets a temporary password; `mustChangePassword` forces the member to pick a
 * new one on first sign-in so the owner never retains a working credential.
 * Gated on the built-in owner role, never a grantable permission.
 */
export async function createMemberAction(input: {
  name: string;
  email: string;
  role: string;
  password: string;
  image?: string;
  jobTitle?: string;
}): Promise<ActionResult> {
  try {
    const context = await getWorkspaceContext();
    if (!isOwnerRole(context.roleKey)) {
      return { success: false, error: "Only the workspace owner can do this." };
    }

    const parsed = createMemberSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid member.",
      };
    }

    const email = parsed.data.email.toLowerCase();

    if (!(await isAssignableRole(context.organization.id, parsed.data.role))) {
      return { success: false, error: "That role no longer exists." };
    }
    // Provisioning an owner would let an owner mint co-owners silently; keep the
    // owner role invite/promote-only.
    if (isOwnerRole(parsed.data.role)) {
      return { success: false, error: "Owners can't be created here." };
    }

    if (await getAuthUserByEmail(email)) {
      return {
        success: false,
        error: "A user with that email already exists. Invite them instead.",
      };
    }

    const { hashPassword } = await import("better-auth/crypto");
    const passwordHash = await hashPassword(parsed.data.password);

    const userId = crypto.randomUUID();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(authUsers).values({
        id: userId,
        name: parsed.data.name,
        email,
        emailVerified: true,
        image: parsed.data.image,
        jobTitle: parsed.data.jobTitle || null,
        mustChangePassword: true,
        // Owner-provisioned accounts skip the personal onboarding flow.
        onboardingCompletedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(authAccounts).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      });

      const memberId = crypto.randomUUID();
      await tx.insert(authMembers).values({
        id: memberId,
        organizationId: context.organization.id,
        userId,
        role: parsed.data.role,
        createdAt: now,
      });

      await provisionMemberSenderIdentity(tx, {
        organizationId: context.organization.id,
        memberId,
        userId,
        name: parsed.data.name,
      });
    });

    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "member.created",
      resourceType: "member",
      resourceId: userId,
      severity: "warning",
      metadata: { email, role: parsed.data.role },
    });

    revalidatePath("/settings/members");
    return { success: true };
  } catch (error) {
    log.error(error, "createMemberAction failed");
    return { success: false, error: "Unable to create member." };
  }
}
