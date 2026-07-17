"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { getWorkspaceTelegramConfig } from "@/lib/telegram/config";
import {
  getTelegramBotInfo,
  sendTelegramMessage,
} from "@/lib/telegram/client";
import { telegramText } from "@/server/notify/dispatch";
import { isWebhookEvent } from "@/server/webhooks/events";

const log = createLogger("workspace-telegram-settings");

export type TelegramActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

const saveSchema = z.object({
  enabled: z.boolean(),
  // Optional: when blank, the previously stored token is kept.
  botToken: z.string().trim().max(200).optional(),
  chatId: z.string().trim().max(100),
  events: z.array(z.string()).max(20),
});

export async function saveTelegramSettingsAction(input: {
  enabled: boolean;
  botToken?: string;
  chatId: string;
  events: string[];
}): Promise<TelegramActionResult> {
  const context = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return { ok: false, error: "Server encryption key not configured." };
  }

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { enabled, botToken, chatId, events } = parsed.data;
  const cleanEvents = events.filter(isWebhookEvent);

  const [existing] = await db
    .select({
      ciphertext: workspaceSettings.telegramBotTokenCiphertext,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, context.organization.id))
    .limit(1);
  const hasStored = Boolean(existing?.ciphertext);

  if (!botToken && !hasStored) {
    return { ok: false, error: "Add a bot token first." };
  }
  if (enabled && !chatId) {
    return { ok: false, error: "Add a chat ID before enabling." };
  }

  const set: Partial<typeof workspaceSettings.$inferInsert> = {
    telegramEnabled: enabled,
    telegramChatId: chatId || null,
    telegramEvents: cleanEvents,
    updatedAt: new Date(),
  };

  if (botToken) {
    // Validate against Telegram before persisting , also captures the bot
    // username for the status display.
    try {
      const info = await getTelegramBotInfo(botToken);
      set.telegramBotUsername = info.username;
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? `Telegram rejected that token: ${err.message}`
            : "Telegram rejected that token.",
      };
    }
    const enc = encryptSecret(botToken);
    set.telegramBotTokenCiphertext = enc.ciphertext;
    set.telegramBotTokenIv = enc.iv;
    set.telegramBotTokenTag = enc.tag;
  }

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, ...set })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set,
    });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function disconnectTelegramAction(): Promise<TelegramActionResult> {
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({
      telegramEnabled: false,
      telegramBotTokenCiphertext: null,
      telegramBotTokenIv: null,
      telegramBotTokenTag: null,
      telegramChatId: null,
      telegramBotUsername: null,
      telegramEvents: [],
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * Send a test message. Uses the just-entered token/chat when provided (so
 * users can verify before saving), else the stored config.
 */
export async function sendTestTelegramAction(input: {
  botToken?: string;
  chatId?: string;
}): Promise<TelegramActionResult> {
  const context = await requirePermission("integrations:manage");

  let botToken = input.botToken?.trim() || null;
  let chatId = input.chatId?.trim() || null;

  if (!botToken || !chatId) {
    const stored = await getWorkspaceTelegramConfig(context.organization.id);
    botToken = botToken ?? stored?.botToken ?? null;
    chatId = chatId ?? stored?.chatId ?? null;
  }
  if (!botToken) return { ok: false, error: "Enter a bot token to test." };
  if (!chatId) return { ok: false, error: "Enter a chat ID to test." };

  try {
    await sendTelegramMessage({
      botToken,
      chatId,
      text: telegramText("application.created", {
        candidate: { name: "Jordan Rivera (test)" },
        job: { title: "Senior Engineer" },
      }),
    });
    return { ok: true };
  } catch (err) {
    log.error(err, "sendTestTelegramAction failed");
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Test failed.",
    };
  }
}
