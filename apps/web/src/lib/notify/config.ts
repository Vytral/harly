import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { isWebhookEvent, type WebhookEvent } from "@/server/webhooks/events";

/**
 * Chat-notification provider config. Slack and Discord both accept a single
 * incoming-webhook URL and a JSON POST , no OAuth, no env vars. The URL is the
 * only secret; we store it encrypted at rest.
 */
export type ChatProviderId = "slack" | "discord";

export function isChatProviderId(value: string): value is ChatProviderId {
  return value === "slack" || value === "discord";
}

export type WorkspaceChatStatus = {
  enabled: boolean;
  provider: ChatProviderId | null;
  /** True only when a webhook URL is stored (never the URL itself). */
  hasWebhook: boolean;
  events: WebhookEvent[];
  /** False when AI_ENCRYPTION_KEY is missing/invalid , secrets can't be stored. */
  encryptionReady: boolean;
};

export type ChatConfig = {
  provider: ChatProviderId;
  webhookUrl: string;
  events: WebhookEvent[];
};

function toEvents(raw: unknown): WebhookEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (value): value is WebhookEvent =>
      typeof value === "string" && isWebhookEvent(value),
  );
}

/** Public-safe chat status for the settings UI. Never returns the webhook URL. */
export async function getWorkspaceChatStatus(
  workspaceId: string,
): Promise<WorkspaceChatStatus> {
  const [row] = await db
    .select({
      chatEnabled: workspaceSettings.chatEnabled,
      chatProvider: workspaceSettings.chatProvider,
      chatWebhookCiphertext: workspaceSettings.chatWebhookCiphertext,
      chatEvents: workspaceSettings.chatEvents,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  const provider =
    row?.chatProvider && isChatProviderId(row.chatProvider)
      ? row.chatProvider
      : null;

  return {
    enabled: Boolean(row?.chatEnabled),
    provider,
    hasWebhook: Boolean(row?.chatWebhookCiphertext),
    events: toEvents(row?.chatEvents),
    encryptionReady: isEncryptionConfigured(),
  };
}

/**
 * Resolve a usable chat config (with decrypted webhook URL) for a workspace, or
 * null when disabled / unconfigured / the master key is missing.
 */
export async function getWorkspaceChatConfig(
  workspaceId: string,
): Promise<ChatConfig | null> {
  if (!isEncryptionConfigured()) return null;

  const [row] = await db
    .select({
      chatEnabled: workspaceSettings.chatEnabled,
      chatProvider: workspaceSettings.chatProvider,
      chatWebhookCiphertext: workspaceSettings.chatWebhookCiphertext,
      chatWebhookIv: workspaceSettings.chatWebhookIv,
      chatWebhookTag: workspaceSettings.chatWebhookTag,
      chatEvents: workspaceSettings.chatEvents,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    !row ||
    !row.chatEnabled ||
    !row.chatProvider ||
    !isChatProviderId(row.chatProvider) ||
    !row.chatWebhookCiphertext ||
    !row.chatWebhookIv ||
    !row.chatWebhookTag
  ) {
    return null;
  }

  try {
    const webhookUrl = decryptSecret({
      ciphertext: row.chatWebhookCiphertext,
      iv: row.chatWebhookIv,
      tag: row.chatWebhookTag,
    });

    return {
      provider: row.chatProvider,
      webhookUrl,
      events: toEvents(row.chatEvents),
    };
  } catch {
    return null;
  }
}
