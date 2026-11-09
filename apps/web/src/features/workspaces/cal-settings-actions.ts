"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getTranslations } from "@/i18n/server";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { assertNotDemo } from "@/features/demo/assert-not-demo";
import {
  DEFAULT_CAL_BASE_URL,
  getWorkspaceCalConfig,
  getWorkspaceCalStatus,
} from "@/lib/cal/config";
import { registerCalWebhook, verifyCalConnection } from "@/lib/cal/client";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { resolveSafeAddress } from "@/lib/ssrf";

const log = createLogger("workspace-cal-settings");

export type CalSettingsActionResult = { ok: boolean; error?: string };

type Translate = (key: string, values?: Record<string, string | number>) => string;

function buildSaveSchema(t: Translate) {
  const optionalUrl = z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .refine((value) => !value || URL.canParse(value), t("invalidUrl"));

  return z.object({
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
}

function normalizeCalBaseUrl(value: string, t: Translate): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:") {
    throw new Error(t("httpsRequired"));
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(t("noCredentialsInUrl"));
  }
  return parsed.toString().replace(/\/+$/, "");
}

async function validateCalBaseUrl(value: string, t: Translate): Promise<string> {
  const normalized = normalizeCalBaseUrl(value, t);
  await resolveSafeAddress(new URL(normalized).hostname);
  return normalized;
}

export async function saveCalSettingsAction(input: {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  bookingUrl?: string;
  defaultEventTypeId?: number | string;
}): Promise<CalSettingsActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const t = await getTranslations("server.workspaces.calSettingsActions");

  if (!isEncryptionConfigured()) {
    return {
      ok: false,
      error: t("encryptionKeyMissing"),
    };
  }

  const parsed = buildSaveSchema(t).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? t("invalidSettings"),
    };
  }

  const { enabled, apiKey, baseUrl, bookingUrl, defaultEventTypeId } = parsed.data;

  let calBaseUrl: string;
  try {
    calBaseUrl = await validateCalBaseUrl(baseUrl ?? DEFAULT_CAL_BASE_URL, t);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : t("safeUrl"),
    };
  }

  const status = await getWorkspaceCalStatus(context.organization.id);
  const storedBaseUrl = (() => {
    try {
      return normalizeCalBaseUrl(status.baseUrl, t);
    } catch {
      return null;
    }
  })();
  if (
    status.hasApiKey &&
    !apiKey &&
    storedBaseUrl !== calBaseUrl
  ) {
    return {
      ok: false,
      error: t("apiKeyRequiredForUrlChange"),
    };
  }
  if (enabled && !apiKey && !status.hasApiKey) {
    return { ok: false, error: t("addApiKeyBeforeEnabling") };
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
      calBaseUrl,
      calBookingUrl: bookingUrl,
      calDefaultEventTypeId: defaultEventTypeId,
      ...(webhookSecret ? { calWebhookSecret: webhookSecret } : {}),
      ...keyColumns,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: {
        calEnabled: enabled,
        calBaseUrl,
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
  assertNotDemo();
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
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const t = await getTranslations("server.workspaces.calSettingsActions");

  let apiKey = input.apiKey?.trim() || null;
  const stored = apiKey
    ? null
    : await getWorkspaceCalConfig(context.organization.id);
  const requestedBaseUrl = input.baseUrl?.trim() || null;
  let storedBaseUrl: string | null = null;
  try {
    storedBaseUrl = stored?.baseUrl
      ? normalizeCalBaseUrl(stored.baseUrl, t)
      : null;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : t("storedUrlInvalid"),
    };
  }
  const requestedNormalized = requestedBaseUrl
    ? (() => {
        try {
          return normalizeCalBaseUrl(requestedBaseUrl, t);
        } catch {
          return null;
        }
      })()
    : null;

  if (requestedBaseUrl && !requestedNormalized) {
    return { ok: false, error: t("httpsRequired") };
  }

  if (
    requestedBaseUrl &&
    !apiKey &&
    stored?.apiKey &&
    requestedNormalized !== storedBaseUrl
  ) {
    return {
      ok: false,
      error: t("apiKeyRequiredForUrlChange"),
    };
  }

  // Fall back to the stored key when the field is left blank (managing an
  // existing connection).
  if (!apiKey) {
    apiKey = stored?.apiKey ?? null;
  }
  if (!apiKey) {
    return { ok: false, error: t("enterApiKeyToTest") };
  }

  let baseUrl: string;
  try {
    baseUrl = await validateCalBaseUrl(
      requestedNormalized ?? storedBaseUrl ?? DEFAULT_CAL_BASE_URL,
      t,
    );
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : t("safeUrl"),
    };
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
          : t("cannotReachWithKey"),
    };
  }
}

/**
 * Register Harly's webhook endpoint with Cal.com so bookings sync back. Uses
 * the stored signing secret and the app's public URL.
 */
export async function registerCalWebhookAction(): Promise<CalSettingsActionResult> {
  assertNotDemo();
  const context = await requirePermission("integrations:manage");
  const t = await getTranslations("server.workspaces.calSettingsActions");

  const config = await getWorkspaceCalConfig(context.organization.id);
  if (!config) {
    return { ok: false, error: t("connectFirst") };
  }
  if (!config.webhookSecret) {
    return { ok: false, error: t("missingWebhookSecret") };
  }

  try {
    await registerCalWebhook(config, {
      subscriberUrl: `${getHarlyPublicOrigin()}/api/webhooks/cal?ws=${context.organization.id}`,
      secret: config.webhookSecret,
    });
    return { ok: true };
  } catch (error) {
    log.error(error, "registerCalWebhookAction failed");
    return {
      ok: false,
      error:
        error instanceof Error
          ? t("webhookRegistrationFailedWithReason", { reason: error.message })
          : t("webhookRegistrationFailed"),
    };
  }
}
