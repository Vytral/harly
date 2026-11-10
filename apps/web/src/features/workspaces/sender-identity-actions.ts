"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { getTranslations } from "@/i18n/server";
import { z } from "zod";

import { ApiError } from "@harly/api";

import {
  db,
  member as authMembers,
  memberSenderIdentity,
  user as authUsers,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requireOwner } from "@/features/workspaces/permissions-server";
import { provisionMemberSenderIdentity } from "@/features/workspaces/sender-identity";
import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

const log = createLogger("workspaces.sender-identity");

type Translate = (key: string, values?: Record<string, string | number>) => string;

function buildLocalPartSchema(t: Translate) {
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(1, t("localPartRequired"))
    .max(64, t("localPartTooLong"))
    .regex(/^[a-z0-9.]+$/, t("localPartFormat"));
}

type Result = { success: boolean; error?: string };

/** Owner-only gate: a denial becomes the action's error result. */
async function requireOwnerResult(): Promise<Result | null> {
  try {
    await requireOwner();
    return null;
  } catch (error) {
    if (error instanceof ApiError) return { success: false, error: error.message };
    throw error;
  }
}

/** Owner-only: edit a recruiter's virtual sender local-part/display name. */
export async function updateMemberSenderIdentityAction(input: {
  memberId: string;
  localPart: string;
  displayName?: string;
}): Promise<Result> {
  const t = await getTranslations("server.workspaces.senderIdentityActions");
  try {
    const context = await getWorkspaceContext();
    const denied = await requireOwnerResult();
    if (denied) return denied;

    const parsedLocalPart = buildLocalPartSchema(t).safeParse(input.localPart);
    if (!parsedLocalPart.success) {
      return {
        success: false,
        error: parsedLocalPart.error.issues[0]?.message ?? t("invalidLocalPart"),
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
      return { success: false, error: t("memberNotFound") };
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
      return { success: false, error: t("localPartTaken") };
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
    return { success: false, error: t("updateFailed") };
  }
}

/** Backfill for members provisioned before this feature shipped. */
export async function generateMemberSenderIdentityAction(input: {
  memberId: string;
}): Promise<Result> {
  const t = await getTranslations("server.workspaces.senderIdentityActions");
  try {
    const context = await getWorkspaceContext();
    const denied = await requireOwnerResult();
    if (denied) return denied;

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
      return { success: false, error: t("memberNotFound") };
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
    return { success: false, error: t("generateFailed") };
  }
}
