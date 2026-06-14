"use server";

import crypto from "node:crypto";
import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { sendWorkspaceEmail } from "@/lib/email";
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
  type WorkspaceRole,
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

function canManageMembers(role: WorkspaceRole) {
  return role === "owner" || role === "admin";
}

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
    const parsed = workspaceProfileSchema.safeParse({
      name: formData.get("name"),
      logoUrl: formData.get("logoUrl"),
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

    revalidatePath("/settings");
    revalidatePath("/dashboard");

    return { success: true };
  } catch {
    return {
      success: false,
      error:
        "Unable to update workspace.",
    };
  }
}

export async function inviteWorkspaceMemberAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const context = await requireWorkspaceRole(["owner", "admin"]);
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

    if (!canManageMembers(context.role)) {
      return { success: false, error: "Workspace access denied." };
    }

    if (!(await isAssignableRole(context.organization.id, parsed.data.role))) {
      return { success: false, error: "Unknown role." };
    }

    const authUser = await getAuthUserByEmail(parsed.data.email);

    // Existing user: add them to the organization immediately. New user: create
    // a pending invitation they can accept after signing up.
    if (authUser) {
      await db
        .insert(authMembers)
        .values({
          id: crypto.randomUUID(),
          organizationId: context.organization.id,
          userId: authUser.id,
          role: parsed.data.role,
          createdAt: new Date(),
        })
        .onConflictDoNothing();

      await db
        .update(authMembers)
        .set({ role: parsed.data.role })
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
            eq(sql`lower(${invitation.email})`, parsed.data.email),
            eq(invitation.status, "pending"),
          ),
        );

      revalidatePath("/settings");
      return { success: true };
    }

    const [existingInvitation] = await db
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, context.organization.id),
          eq(sql`lower(${invitation.email})`, parsed.data.email),
          eq(invitation.status, "pending"),
        ),
      )
      .limit(1);

    if (existingInvitation) {
      return {
        success: false,
        error: "This email already has a pending invitation.",
      };
    }

    const invitationId = crypto.randomUUID();
    await db.insert(invitation).values({
      id: invitationId,
      organizationId: context.organization.id,
      email: parsed.data.email,
      role: parsed.data.role,
      status: "pending",
      expiresAt: addDays(new Date(), 7),
      inviterId: context.user.id,
    });

    const requestHeaders = await headers();
    const host = requestHeaders.get("host") ?? "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const acceptUrl = `${protocol}://${host}/invite/${invitationId}`;

    void sendWorkspaceEmail(context.organization.id, {
      to: parsed.data.email,
      subject: workspaceInvitationSubject({
        workspaceName: context.organization.name,
      }),
      react: createElement(WorkspaceInvitation, {
        inviterName: context.user.name,
        workspaceName: context.organization.name,
        role: parsed.data.role,
        acceptUrl,
      }),
    });

    revalidatePath("/settings");
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Unable to invite member.",
    };
  }
}

export async function updateWorkspaceMemberRoleAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const context = await requireWorkspaceRole(["owner", "admin"]);
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
      normalizeWorkspaceRole(targetMember.role) === "owner" &&
      parsed.data.role !== "owner" &&
      (await countOwners(context.organization.id)) <= 1
    ) {
      return { success: false, error: "Workspace must keep at least one owner." };
    }

    await db
      .update(authMembers)
      .set({ role: parsed.data.role })
      .where(eq(authMembers.id, parsed.data.memberId));

    revalidatePath("/settings");
    return { success: true };
  } catch {
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
    const context = await requirePermission("members:manage");
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
  } catch {
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
    const context = await requireWorkspaceRole(["owner", "admin"]);
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
      normalizeWorkspaceRole(targetMember.role) === "owner" &&
      (await countOwners(context.organization.id)) <= 1
    ) {
      return { success: false, error: "Workspace must keep at least one owner." };
    }

    await db.delete(authMembers).where(eq(authMembers.id, targetMember.id));

    revalidatePath("/settings");
    return { success: true };
  } catch {
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
    const context = await requireWorkspaceRole(["owner", "admin"]);

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

    revalidatePath("/settings");
    return { success: true };
  } catch {
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

      const role = normalizeWorkspaceRole(targetInvitation.role);

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
  } catch {
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
  } catch {
    return {
      success: false,
      error: "Unable to leave workspace.",
    };
  }
}
