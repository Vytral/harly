import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { isWebhookEvent, type WebhookEvent } from "@/server/webhooks/events";

/**
 * Telegram notification config. A bot token (from @BotFather) plus a chat id
 * are all that's needed , no OAuth. The token is the only secret; stored as an
 * AES-GCM triple like every other integration credential.
 */

export type WorkspaceTelegramStatus = {
  enabled: boolean;
  /** True only when a bot token is stored (never the token itself). */
  hasToken: boolean;
  chatId: string | null;
  botUsername: string | null;
  events: WebhookEvent[];
  /** False when AI_ENCRYPTION_KEY is missing/invalid , secrets can't be stored. */
  encryptionReady: boolean;
};

export type TelegramConfig = {
  botToken: string;
  chatId: string;
  events: WebhookEvent[];
};

function toEvents(raw: unknown): WebhookEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (value): value is WebhookEvent =>
      typeof value === "string" && isWebhookEvent(value),
  );
}

/** Public-safe Telegram status for the settings UI. Never returns the token. */
export async function getWorkspaceTelegramStatus(
  workspaceId: string,
): Promise<WorkspaceTelegramStatus> {
  const [row] = await db
    .select({
      telegramEnabled: workspaceSettings.telegramEnabled,
      telegramBotTokenCiphertext: workspaceSettings.telegramBotTokenCiphertext,
      telegramChatId: workspaceSettings.telegramChatId,
      telegramBotUsername: workspaceSettings.telegramBotUsername,
      telegramEvents: workspaceSettings.telegramEvents,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  return {
    enabled: Boolean(row?.telegramEnabled),
    hasToken: Boolean(row?.telegramBotTokenCiphertext),
    chatId: row?.telegramChatId ?? null,
    botUsername: row?.telegramBotUsername ?? null,
    events: toEvents(row?.telegramEvents),
    encryptionReady: isEncryptionConfigured(),
  };
}

/**
 * Resolve a usable Telegram config (with decrypted bot token) for a workspace,
 * or null when disabled / unconfigured / the master key is missing.
 */
export async function getWorkspaceTelegramConfig(
  workspaceId: string,
): Promise<TelegramConfig | null> {
  if (!isEncryptionConfigured()) return null;

  const [row] = await db
    .select({
      telegramEnabled: workspaceSettings.telegramEnabled,
      telegramBotTokenCiphertext: workspaceSettings.telegramBotTokenCiphertext,
      telegramBotTokenIv: workspaceSettings.telegramBotTokenIv,
      telegramBotTokenTag: workspaceSettings.telegramBotTokenTag,
      telegramChatId: workspaceSettings.telegramChatId,
      telegramEvents: workspaceSettings.telegramEvents,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    !row ||
    !row.telegramEnabled ||
    !row.telegramChatId ||
    !row.telegramBotTokenCiphertext ||
    !row.telegramBotTokenIv ||
    !row.telegramBotTokenTag
  ) {
    return null;
  }

  try {
    const botToken = decryptSecret({
      ciphertext: row.telegramBotTokenCiphertext,
      iv: row.telegramBotTokenIv,
      tag: row.telegramBotTokenTag,
    });

    return {
      botToken,
      chatId: row.telegramChatId,
      events: toEvents(row.telegramEvents),
    };
  } catch {
    return null;
  }
}
