"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, user as userTable, workspaceSettings } from "@harly/db";

import { auth } from "@/lib/auth";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { mustSetUp2fa } from "@/lib/two-factor";
import { createLogger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-log";

const log = createLogger("onboarding");

export type OnboardingResult = { ok: boolean; error?: string };

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

/** Upsert a partial workspace_settings row for the active workspace. */
async function patchWorkspaceSettings(
  organizationId: string,
  patch: Partial<typeof workspaceSettings.$inferInsert>,
) {
  await db
    .insert(workspaceSettings)
    .values({ organizationId, ...patch })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { ...patch, updatedAt: new Date() },
    });
}

const brandingSchema = z.object({
  tagline: z.string().trim().max(120).optional(),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{6})$/, "Use a hex color like #3f6212")
    .optional(),
});

/** Owner step: careers-page branding (color + tagline). Logo is handled by the
 *  existing storage upload flow and saved separately. */
export async function saveOnboardingBrandingAction(input: {
  tagline?: string;
  primaryColor?: string;
}): Promise<OnboardingResult> {
  try {
    const { organization } = await requirePermission("settings:edit");
    const parsed = brandingSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
    }
    await patchWorkspaceSettings(organization.id, {
      tagline: parsed.data.tagline ?? null,
      primaryColor: parsed.data.primaryColor ?? null,
    });
    return { ok: true };
  } catch (error) {
    log.error(error, "onboarding action failed");
    return { ok: false, error: error instanceof Error ? error.message : "Failed." };
  }
}

/** Owner step: acquisition source ("how did you hear about us"). */
export async function saveAcquisitionAction(
  source: string,
): Promise<OnboardingResult> {
  try {
    const parsed = z.string().trim().min(1).max(60).safeParse(source);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
    }
    const { organization } = await requirePermission("settings:edit");
    await patchWorkspaceSettings(organization.id, {
      acquisitionSource: parsed.data,
    });
    return { ok: true };
  } catch (error) {
    log.error(error, "onboarding action failed");
    return { ok: false, error: error instanceof Error ? error.message : "Failed." };
  }
}

/** Any user: their own job title (shown on profile + hiring team views). */
export async function saveUserRoleAction(
  jobTitle: string,
): Promise<OnboardingResult> {
  try {
    const parsed = z.string().trim().min(1).max(80).safeParse(jobTitle);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
    }
    const session = await requireSession();
    await db
      .update(userTable)
      .set({ jobTitle: parsed.data })
      .where(eq(userTable.id, session.user.id));
    return { ok: true };
  } catch (error) {
    log.error(error, "onboarding action failed");
    return { ok: false, error: error instanceof Error ? error.message : "Failed." };
  }
}

/** Any user: the self-described role chosen during onboarding. */
export async function saveOnboardingRoleAction(
  role: string,
): Promise<OnboardingResult> {
  try {
    const parsed = z
      .enum(["founder", "recruiter", "hr_manager", "hiring_manager", "other"])
      .safeParse(role);
    if (!parsed.success) {
      return { ok: false, error: "Invalid role." };
    }
    const session = await requireSession();
    await db
      .update(userTable)
      .set({ onboardingRole: parsed.data })
      .where(eq(userTable.id, session.user.id));
    return { ok: true };
  } catch (error) {
    log.error(error, "onboarding action failed");
    return { ok: false, error: error instanceof Error ? error.message : "Failed." };
  }
}

/** Owner step: require 2FA for all members (workspace policy). */
export async function setRequire2faAction(
  require2fa: boolean,
): Promise<OnboardingResult> {
  try {
    const { organization, user } = await requirePermission("security:manage");
    await patchWorkspaceSettings(organization.id, { require2fa });
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: require2fa ? "settings.2fa_enforced" : "settings.2fa_unenforced",
      severity: "critical",
      metadata: { require2fa, source: "onboarding" },
    });
    return { ok: true };
  } catch (error) {
    log.error(error, "onboarding action failed");
    return { ok: false, error: error instanceof Error ? error.message : "Failed." };
  }
}

/**
 * Recruiter/member completion — enforces the workspace 2FA policy server-side
 * (don't trust the client): if the workspace requires 2FA, the user must have
 * it enabled before onboarding can complete.
 */
export async function completeRecruiterOnboardingAction(): Promise<OnboardingResult> {
  try {
    const { organization, user, roleKey } = await getWorkspaceContext();

    const [settings] = await db
      .select({ require2fa: workspaceSettings.require2fa })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, organization.id))
      .limit(1);

    if (settings?.require2fa) {
      const [row] = await db
        .select({ twoFactorEnabled: userTable.twoFactorEnabled })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);
      // Owner is exempt from 2FA enforcement — keep this consistent with the
      // middleware policy via the shared helper.
      if (
        mustSetUp2fa({
          workspaceRequires2fa: settings.require2fa,
          userHas2fa: row?.twoFactorEnabled ?? false,
          roleKey,
        })
      ) {
        return {
          ok: false,
          error: "This workspace requires two-factor authentication. Set it up to continue.",
        };
      }
    }

    await db
      .update(userTable)
      .set({ onboardingCompletedAt: sql`now()` })
      .where(eq(userTable.id, user.id));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    log.error(error, "onboarding action failed");
    return { ok: false, error: error instanceof Error ? error.message : "Failed." };
  }
}

/** Mark the current user's onboarding finished — the per-user gate. */
export async function completeOnboardingAction(): Promise<OnboardingResult> {
  try {
    const session = await requireSession();
    await db
      .update(userTable)
      .set({ onboardingCompletedAt: sql`now()` })
      .where(eq(userTable.id, session.user.id));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    log.error(error, "onboarding action failed");
    return { ok: false, error: error instanceof Error ? error.message : "Failed." };
  }
}
