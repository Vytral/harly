"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  member as authMembers,
  memberSenderIdentity,
  user as authUsers,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { provisionMemberSenderIdentity } from "@/features/workspaces/sender-identity";
import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

const log = createLogger("workspaces.sender-identity");

const localPartSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter a local-part.")
  .max(64, "Keep it under 64 characters.")
  .regex(/^[a-z0-9.]+$/, "Only lowercase letters, digits, and dots.");

type Result = { success: boolean; error?: string };

/** Owner-only: edit a recruiter's virtual sender local-part/display name. */
export async function updateMemberSenderIdentityAction(input: {
  memberId: string;
  localPart: string;
  displayName?: string;
}): Promise<Result> {
  try {
    const context = await getWorkspaceContext();
    if (context.roleKey !== "owner") {
      return { success: false, error: "Only the workspace owner can do this." };
    }

    const parsedLocalPart = localPartSchema.safeParse(input.localPart);
    if (!parsedLocalPart.success) {
      return {
        success: false,
        error: parsedLocalPart.error.issues[0]?.message ?? "Invalid local-part.",
      };
    }

    const [target] = await db
      .select({ id: authMembers.id, userId: authMembers.userId })
      .from(authMembers)
      .where(
        and(
          eq(authMembers.id, input.memberId),
          eq(authMembers.organizationId, context.organization.id),
        ),
      )
      .limit(1);
    if (!target) {
      return { success: false, error: "Member not found." };
    }

    const [conflict] = await db
      .select({ id: memberSenderIdentity.id })
      .from(memberSenderIdentity)
      .where(
        and(
          eq(memberSenderIdentity.organizationId, context.organization.id),
          eq(memberSenderIdentity.localPart, parsedLocalPart.data),
          ne(memberSenderIdentity.memberId, input.memberId),
        ),
      )
      .limit(1);
    if (conflict) {
      return { success: false, error: "That local-part is already in use." };
    }

    const displayName = input.displayName?.trim() || null;

    await db
      .insert(memberSenderIdentity)
      .values({
        organizationId: context.organization.id,
        memberId: target.id,
        userId: target.userId,
        localPart: parsedLocalPart.data,
        displayName,
        isManuallyEdited: true,
      })
      .onConflictDoUpdate({
        target: [memberSenderIdentity.memberId],
        set: {
          localPart: parsedLocalPart.data,
          displayName,
          isManuallyEdited: true,
          updatedAt: new Date(),
        },
      });

    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "member.sender_identity.updated",
      severity: "info",
      metadata: { memberId: target.id, localPart: parsedLocalPart.data },
    });

    revalidatePath("/settings/members");
    return { success: true };
  } catch (error) {
    log.error(error, "updateMemberSenderIdentityAction failed");
    return { success: false, error: "Unable to update sender identity." };
  }
}

/** Backfill for members provisioned before this feature shipped. */
export async function generateMemberSenderIdentityAction(input: {
  memberId: string;
}): Promise<Result> {
  try {
    const context = await getWorkspaceContext();
    if (context.roleKey !== "owner") {
      return { success: false, error: "Only the workspace owner can do this." };
    }

    const [target] = await db
      .select({
        id: authMembers.id,
        userId: authMembers.userId,
        name: authUsers.name,
      })
      .from(authMembers)
      .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
      .where(
        and(
          eq(authMembers.id, input.memberId),
          eq(authMembers.organizationId, context.organization.id),
        ),
      )
      .limit(1);
    if (!target) {
      return { success: false, error: "Member not found." };
    }

    await provisionMemberSenderIdentity(db, {
      organizationId: context.organization.id,
      memberId: target.id,
      userId: target.userId,
      name: target.name,
    });

    revalidatePath("/settings/members");
    return { success: true };
  } catch (error) {
    log.error(error, "generateMemberSenderIdentityAction failed");
    return { success: false, error: "Unable to generate a sender identity." };
  }
}
