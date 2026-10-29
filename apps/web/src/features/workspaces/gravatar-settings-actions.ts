"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";
import { assertNotDemo } from "@/features/demo/assert-not-demo";

export type GravatarSettingsActionResult = { ok: boolean; error?: string };

const saveSchema = z.object({ enabled: z.boolean() });

/**
 * Turns Gravatar profile pictures on or off for the workspace. Requires
 * settings:edit, which is held by owners and admins.
 */
export async function saveGravatarEnabledAction(
  enabled: boolean,
): Promise<GravatarSettingsActionResult> {
  assertNotDemo();
  const context = await requirePermission("settings:edit");

  const parsed = saveSchema.safeParse({ enabled });
  if (!parsed.success) return { ok: false, error: "Invalid setting." };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, gravatarEnabled: parsed.data.enabled })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { gravatarEnabled: parsed.data.enabled, updatedAt: new Date() },
    });

  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: parsed.data.enabled ? "settings.gravatar_enabled" : "settings.gravatar_disabled",
    severity: "info",
  });

  revalidatePath("/settings");
  return { ok: true };
}
