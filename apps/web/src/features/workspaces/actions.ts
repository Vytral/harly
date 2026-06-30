"use server";

import crypto from "node:crypto";
import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit-log";
import { sendWorkspaceEmail } from "@/lib/email";
import { getWorkspaceEmailBranding } from "@/lib/email/branding";
import { createLogger } from "@/lib/logger";
import { db } from "@harly/db";
import {
  customRoles,
  invitation,
  member as authMembers,
  organization as authOrganizations,
  session as authSessions,
  user as authUsers,
  workspaceSettings,
} from "@harly/db";
import { isBuiltinRole } from "@/features/workspaces/permissions";
import {
  WorkspaceInvitation,
  workspaceInvitationSubject,
} from "@harly/emails";
import {
  getWorkspaceContext,
  requireWorkspaceRole,
} from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import {
  normalizeWorkspaceRole,
} from "@/features/workspaces/roles";
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

// Role may be a built-in key OR a workspace custom-role key — validated at
// runtime against the workspace via isAssignableRole().
const inviteMemberSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: z.string().trim().min(1),
});

const updateMemberRoleSchema = z.object({
  memberId: z.string().trim().min(1),
  role: z.string().trim().min(1),
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

const log = createLogger("workspaces");

export async function updateWorkspaceBoardBrandingAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const context = await requireWorkspaceRole(["owner", "admin"]);
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
    const context = await requireWorkspaceRole(["owner", "admin"]);
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
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        await fetch(`${appUrl}/api/logo/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            logoUrl: parsed.data.logoUrl,
            organizationId: context.organization.id,
          }),
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
 * authorized the actor. Does NOT revalidate — callers revalidate once.
 * Existing user → added to the org immediately. New user → pending invitation
 * + email. Role is assumed already validated as assignable.
 */
async function inviteOneMember(
  context: InviteContext,
  email: string,
  role: string,
): Promise<InviteOneResult> {
  const authUser = await getAuthUserByEmail(email);

  if (authUser) {
    await db
      .insert(authMembers)
      .values({
        id: crypto.randomUUID(),
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

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const acceptUrl = `${protocol}://${host}/invite/${invitationId}`;
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

    if (!(await isAssignableRole(context.organization.id, parsed.data.role))) {
      return { success: false, error: "Unknown role." };
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
      if (!(await isAssignableRole(context.organization.id, role))) {
        skipped.push({ email, reason: "Unknown role." });
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

      await tx
        .insert(authMembers)
        .values({
          id: crypto.randomUUID(),
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
    if (!(await isAssignableRole(context.organization.id, parsed.data.role))) {
      return { success: false, error: "Unknown role." };
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

    await db
      .insert(authMembers)
      .values({
        id: crypto.randomUUID(),
        organizationId: ws.organizationId,
        userId: session.user.id,
        role,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

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
