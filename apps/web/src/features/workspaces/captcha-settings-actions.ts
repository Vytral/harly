"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import {
  getWorkspaceCaptchaStatus,
  isCaptchaProvider,
  type CaptchaProvider,
} from "@/lib/captcha";

export type CaptchaSettingsActionResult = { ok: boolean; error?: string };

/** Per-provider column names. Turnstile reuses its pre-existing columns. */
const COLUMNS: Record<
  CaptchaProvider,
  { siteKey: string; ciphertext: string; iv: string; tag: string }
> = {
  turnstile: {
    siteKey: "turnstileSiteKey",
    ciphertext: "turnstileSecretCiphertext",
    iv: "turnstileSecretIv",
    tag: "turnstileSecretTag",
  },
  recaptcha: {
    siteKey: "recaptchaSiteKey",
    ciphertext: "recaptchaSecretCiphertext",
    iv: "recaptchaSecretIv",
    tag: "recaptchaSecretTag",
  },
  hcaptcha: {
    siteKey: "hcaptchaSiteKey",
    ciphertext: "hcaptchaSecretCiphertext",
    iv: "hcaptchaSecretIv",
    tag: "hcaptchaSecretTag",
  },
};

const saveSchema = z.object({
  provider: z.string().refine(isCaptchaProvider, "Unknown provider."),
  enabled: z.boolean(),
  siteKey: z.string().trim().max(500).optional(),
  // When blank, the previously stored secret is kept.
  secretKey: z.string().trim().max(500).optional(),
});

export async function saveCaptchaSettingsAction(input: {
  provider: CaptchaProvider;
  enabled: boolean;
  siteKey?: string;
  secretKey?: string;
}): Promise<CaptchaSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return {
      ok: false,
      error:
        "Server is missing AI_ENCRYPTION_KEY. Set it to store the CAPTCHA secret.",
    };
  }

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid settings.",
    };
  }

  const { provider, enabled, siteKey, secretKey } = parsed.data;
  const cols = COLUMNS[provider];
  const status = await getWorkspaceCaptchaStatus(context.organization.id);
  const existing = status.providers[provider];

  // Enabling needs both halves present (existing or newly entered).
  const willHaveSiteKey = Boolean(siteKey || existing.siteKey);
  const willHaveSecret = Boolean(secretKey || existing.hasSecretKey);
  if (enabled && (!willHaveSiteKey || !willHaveSecret)) {
    return {
      ok: false,
      error: "Add both the site key and secret key before enabling.",
    };
  }

  const encrypted = secretKey ? encryptSecret(secretKey) : null;
  const secretColumns = encrypted
    ? {
        [cols.ciphertext]: encrypted.ciphertext,
        [cols.iv]: encrypted.iv,
        [cols.tag]: encrypted.tag,
      }
    : {};

  // Empty string clears the site key; undefined keeps it.
  const siteKeyColumn =
    siteKey !== undefined ? { [cols.siteKey]: siteKey || null } : {};

  // Setting captchaProvider to this provider is what enforces single-active:
  // the other providers' keys stay stored but only this one is verified.
  const providerColumns = enabled
    ? { captchaEnabled: true, captchaProvider: provider }
    : {};

  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      captchaEnabled: enabled,
      captchaProvider: enabled ? provider : null,
      ...siteKeyColumn,
      ...secretColumns,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: {
        ...providerColumns,
        ...siteKeyColumn,
        ...secretColumns,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function disableCaptchaAction(): Promise<CaptchaSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({ captchaEnabled: false, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath("/settings/integrations");
  return { ok: true };
}
