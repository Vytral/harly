"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import {
  DEFAULT_CAL_BASE_URL,
  getWorkspaceCalConfig,
  getWorkspaceCalStatus,
} from "@/lib/cal/config";
import { registerCalWebhook, verifyCalConnection } from "@/lib/cal/client";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";

const log = createLogger("workspace-cal-settings");

export type CalSettingsActionResult = { ok: boolean; error?: string };

const optionalUrl = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .refine((value) => !value || URL.canParse(value), "Enter a valid URL.");

const saveSchema = z.object({
  enabled: z.boolean(),
  // Optional: when blank, the previously stored key is kept.
  apiKey: z.string().trim().max(500).optional(),
  baseUrl: optionalUrl,
  bookingUrl: optionalUrl,
  defaultEventTypeId: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
});

export async function saveCalSettingsAction(input: {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  bookingUrl?: string;
  defaultEventTypeId?: number | string;
}): Promise<CalSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return {
      ok: false,
      error: "Server is missing AI_ENCRYPTION_KEY. Set it to store the Cal.com key.",
    };
  }

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid settings.",
    };
  }

  const { enabled, apiKey, baseUrl, bookingUrl, defaultEventTypeId } = parsed.data;

  const status = await getWorkspaceCalStatus(context.organization.id);
  if (enabled && !apiKey && !status.hasApiKey) {
    return { ok: false, error: "Add a Cal.com API key before enabling." };
  }

  const encrypted = apiKey ? encryptSecret(apiKey) : null;
  const keyColumns = encrypted
    ? {
        calApiKeyCiphertext: encrypted.ciphertext,
        calApiKeyIv: encrypted.iv,
        calApiKeyTag: encrypted.tag,
      }
    : {};

  // Mint a signing secret once; reuse it so a registered webhook stays valid.
  const webhookSecret = status.hasWebhookSecret
    ? undefined
    : randomBytes(32).toString("hex");

  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      calEnabled: enabled,
      calBaseUrl: baseUrl ?? DEFAULT_CAL_BASE_URL,
      calBookingUrl: bookingUrl,
      calDefaultEventTypeId: defaultEventTypeId,
      ...(webhookSecret ? { calWebhookSecret: webhookSecret } : {}),
      ...keyColumns,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: {
        calEnabled: enabled,
        calBaseUrl: baseUrl ?? DEFAULT_CAL_BASE_URL,
        calBookingUrl: bookingUrl,
        calDefaultEventTypeId: defaultEventTypeId,
        ...(webhookSecret ? { calWebhookSecret: webhookSecret } : {}),
        ...keyColumns,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/settings");
  return { ok: true };
}

export async function disableCalAction(): Promise<CalSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({ calEnabled: false, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Validate an API key against Cal.com without persisting it. Lets the connect
 * form show a live pass/fail before the user commits credentials.
 */
export async function testCalConnectionAction(input: {
  apiKey?: string;
  baseUrl?: string;
}): Promise<CalSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  const baseUrl =
    input.baseUrl && URL.canParse(input.baseUrl)
      ? input.baseUrl
      : DEFAULT_CAL_BASE_URL;

  let apiKey = input.apiKey?.trim() || null;
  // Fall back to the stored key when the field is left blank (managing an
  // existing connection).
  if (!apiKey) {
    const stored = await getWorkspaceCalConfig(context.organization.id);
    apiKey = stored?.apiKey ?? null;
  }
  if (!apiKey) {
    return { ok: false, error: "Enter an API key to test." };
  }

  try {
    await verifyCalConnection({ apiKey, baseUrl });
    return { ok: true };
  } catch (error) {
    log.error(error, "testCalConnectionAction failed");
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach Cal.com with that key.",
    };
  }
}

/**
 * Register Harly's webhook endpoint with Cal.com so bookings sync back. Uses
 * the stored signing secret and the app's public URL.
 */
export async function registerCalWebhookAction(): Promise<CalSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  const config = await getWorkspaceCalConfig(context.organization.id);
  if (!config) {
    return { ok: false, error: "Connect Cal.com (API key + enable) first." };
  }
  if (!config.webhookSecret) {
    return { ok: false, error: "Missing webhook secret. Save settings again." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return { ok: false, error: "Server is missing NEXT_PUBLIC_APP_URL." };
  }

  try {
    await registerCalWebhook(config, {
      subscriberUrl: `${appUrl.replace(/\/$/, "")}/api/webhooks/cal?ws=${context.organization.id}`,
      secret: config.webhookSecret,
    });
    return { ok: true };
  } catch (error) {
    log.error(error, "registerCalWebhookAction failed");
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Could not register webhook: ${error.message}`
          : "Could not register webhook.",
    };
  }
}
