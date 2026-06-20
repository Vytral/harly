"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { getWorkspaceTurnstileStatus } from "@/lib/turnstile";

export type TurnstileSettingsActionResult = { ok: boolean; error?: string };

const saveSchema = z.object({
  enabled: z.boolean(),
  siteKey: z.string().trim().max(200).optional(),
  // When blank, the previously stored secret is kept.
  secretKey: z.string().trim().max(200).optional(),
});

export async function saveTurnstileSettingsAction(input: {
  enabled: boolean;
  siteKey?: string;
  secretKey?: string;
}): Promise<TurnstileSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return {
      ok: false,
      error:
        "Server is missing AI_ENCRYPTION_KEY. Set it to store the Turnstile secret.",
    };
  }

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid settings.",
    };
  }

  const { enabled, siteKey, secretKey } = parsed.data;
  const status = await getWorkspaceTurnstileStatus(context.organization.id);

  // Enabling needs both halves present (existing or newly entered).
  const willHaveSiteKey = Boolean(siteKey || status.siteKey);
  const willHaveSecret = Boolean(secretKey || status.hasSecretKey);
  if (enabled && (!willHaveSiteKey || !willHaveSecret)) {
    return {
      ok: false,
      error: "Add both the site key and secret key before enabling.",
    };
  }

  const encrypted = secretKey ? encryptSecret(secretKey) : null;
  const secretColumns = encrypted
    ? {
        turnstileSecretCiphertext: encrypted.ciphertext,
        turnstileSecretIv: encrypted.iv,
        turnstileSecretTag: encrypted.tag,
      }
    : {};

  // Empty string clears the site key; undefined keeps it.
  const siteKeyColumn =
    siteKey !== undefined ? { turnstileSiteKey: siteKey || null } : {};

  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      turnstileEnabled: enabled,
      ...(siteKey !== undefined ? { turnstileSiteKey: siteKey || null } : {}),
      ...secretColumns,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: {
        turnstileEnabled: enabled,
        ...siteKeyColumn,
        ...secretColumns,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function disableTurnstileAction(): Promise<TurnstileSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({ turnstileEnabled: false, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath("/settings/integrations");
  return { ok: true };
}
