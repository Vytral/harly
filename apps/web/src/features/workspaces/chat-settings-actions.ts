"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import {
  getWorkspaceChatConfig,
  isChatProviderId,
  type ChatProviderId,
} from "@/lib/notify/config";
import { sendChatMessage } from "@/server/notify/dispatch";
import { isWebhookEvent } from "@/server/webhooks/events";

export type ChatSettingsActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

/**
 * Allowed webhook hosts per provider. Locking the host prevents the encrypted
 * URL field from being abused as a server-side request forgery (SSRF) primitive
 * , Harly will only ever POST to the real Slack/Discord webhook endpoints.
 */
const ALLOWED_HOSTS: Record<ChatProviderId, string[]> = {
  slack: ["hooks.slack.com"],
  discord: ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"],
};

function validateWebhookUrl(
  provider: ChatProviderId,
  url: string,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Enter a valid webhook URL.";
  }
  if (parsed.protocol !== "https:") return "Webhook URL must use https.";
  if (!ALLOWED_HOSTS[provider].includes(parsed.hostname)) {
    return provider === "slack"
      ? "Slack webhooks start with https://hooks.slack.com/…"
      : "Discord webhooks start with https://discord.com/api/webhooks/…";
  }
  return null;
}

const saveSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["slack", "discord"]),
  webhookUrl: z.string().trim().max(500).optional(),
  events: z.array(z.string()).max(20),
});

export async function saveChatSettingsAction(input: {
  enabled: boolean;
  provider: ChatProviderId;
  webhookUrl?: string;
  events: string[];
}): Promise<ChatSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return { ok: false, error: "Server encryption key not configured." };
  }

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { enabled, provider, webhookUrl, events } = parsed.data;
  const cleanEvents = events.filter(isWebhookEvent);

  // Determine whether a webhook is already stored.
  const [existing] = await db
    .select({ ciphertext: workspaceSettings.chatWebhookCiphertext })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, context.organization.id))
    .limit(1);
  const hasStored = Boolean(existing?.ciphertext);

  const set: Partial<typeof workspaceSettings.$inferInsert> = {
    chatEnabled: enabled,
    chatProvider: provider,
    chatEvents: cleanEvents,
    updatedAt: new Date(),
  };

  if (webhookUrl && webhookUrl.length > 0) {
    const error = validateWebhookUrl(provider, webhookUrl);
    if (error) return { ok: false, error };
    const enc = encryptSecret(webhookUrl);
    set.chatWebhookCiphertext = enc.ciphertext;
    set.chatWebhookIv = enc.iv;
    set.chatWebhookTag = enc.tag;
  } else if (enabled && !hasStored) {
    return { ok: false, error: "Add a webhook URL first." };
  }

  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      ...set,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set,
    });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function disableChatAction(): Promise<ChatSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({ chatEnabled: false, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * Send a test message. Uses the just-entered URL when provided (so users can
 * verify before saving), else the stored config.
 */
export async function sendTestChatAction(input: {
  provider: ChatProviderId;
  webhookUrl?: string;
}): Promise<ChatSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  let webhookUrl = input.webhookUrl?.trim();
  if (webhookUrl) {
    const error = validateWebhookUrl(input.provider, webhookUrl);
    if (error) return { ok: false, error };
  } else {
    const stored = await getWorkspaceChatConfig(context.organization.id);
    if (!stored) return { ok: false, error: "No webhook configured yet." };
    webhookUrl = stored.webhookUrl;
  }

  if (!isChatProviderId(input.provider)) {
    return { ok: false, error: "Unknown provider." };
  }

  const result = await sendChatMessage(
    { provider: input.provider, webhookUrl, events: [] },
    "application.created",
    {
      candidate: { name: "Jordan Rivera (test)" },
      job: { title: "Senior Engineer" },
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? `Provider returned ${result.status ?? "an error"}.`,
    };
  }
  return { ok: true };
}
