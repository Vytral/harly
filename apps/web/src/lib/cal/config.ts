import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

export const DEFAULT_CAL_BASE_URL = "https://api.cal.com/v2";

export type WorkspaceCalStatus = {
  enabled: boolean;
  baseUrl: string;
  bookingUrl: string | null;
  defaultEventTypeId: number | null;
  /** True only when an API key is stored (never the key itself). */
  hasApiKey: boolean;
  /** True when a webhook signing secret exists. */
  hasWebhookSecret: boolean;
  /** False when AI_ENCRYPTION_KEY is missing/invalid , Cal.com can't be used. */
  encryptionReady: boolean;
};

/** Public-safe Cal.com status for the settings UI. Never returns the API key. */
export async function getWorkspaceCalStatus(
  workspaceId: string,
): Promise<WorkspaceCalStatus> {
  const [row] = await db
    .select({
      calEnabled: workspaceSettings.calEnabled,
      calBaseUrl: workspaceSettings.calBaseUrl,
      calBookingUrl: workspaceSettings.calBookingUrl,
      calDefaultEventTypeId: workspaceSettings.calDefaultEventTypeId,
      calApiKeyCiphertext: workspaceSettings.calApiKeyCiphertext,
      calWebhookSecret: workspaceSettings.calWebhookSecret,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  return {
    enabled: Boolean(row?.calEnabled),
    baseUrl: row?.calBaseUrl || DEFAULT_CAL_BASE_URL,
    bookingUrl: row?.calBookingUrl ?? null,
    defaultEventTypeId: row?.calDefaultEventTypeId ?? null,
    hasApiKey: Boolean(row?.calApiKeyCiphertext),
    hasWebhookSecret: Boolean(row?.calWebhookSecret),
    encryptionReady: isEncryptionConfigured(),
  };
}

export type WorkspaceCalConfig = {
  apiKey: string;
  baseUrl: string;
  bookingUrl: string | null;
  defaultEventTypeId: number | null;
  webhookSecret: string | null;
};

/**
 * Resolve a usable Cal.com config (with decrypted API key) for a workspace, or
 * null when Cal.com is disabled / unconfigured / the master key is missing.
 */
export async function getWorkspaceCalConfig(
  workspaceId: string,
): Promise<WorkspaceCalConfig | null> {
  if (!isEncryptionConfigured()) {
    return null;
  }

  const [row] = await db
    .select({
      calEnabled: workspaceSettings.calEnabled,
      calBaseUrl: workspaceSettings.calBaseUrl,
      calBookingUrl: workspaceSettings.calBookingUrl,
      calDefaultEventTypeId: workspaceSettings.calDefaultEventTypeId,
      calApiKeyCiphertext: workspaceSettings.calApiKeyCiphertext,
      calApiKeyIv: workspaceSettings.calApiKeyIv,
      calApiKeyTag: workspaceSettings.calApiKeyTag,
      calWebhookSecret: workspaceSettings.calWebhookSecret,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    !row ||
    !row.calEnabled ||
    !row.calApiKeyCiphertext ||
    !row.calApiKeyIv ||
    !row.calApiKeyTag
  ) {
    return null;
  }

  try {
    const apiKey = decryptSecret({
      ciphertext: row.calApiKeyCiphertext,
      iv: row.calApiKeyIv,
      tag: row.calApiKeyTag,
    });

    return {
      apiKey,
      baseUrl: row.calBaseUrl || DEFAULT_CAL_BASE_URL,
      bookingUrl: row.calBookingUrl ?? null,
      defaultEventTypeId: row.calDefaultEventTypeId ?? null,
      webhookSecret: row.calWebhookSecret ?? null,
    };
  } catch {
    return null;
  }
}
