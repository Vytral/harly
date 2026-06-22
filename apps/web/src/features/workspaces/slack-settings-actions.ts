"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { WebClient } from "@slack/web-api";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { getWorkspaceSlackConfig } from "@/lib/slack/config";
import { isWebhookEvent } from "@/server/webhooks/events";

export type SlackActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

export type SlackChannel = { id: string; name: string };

/** Save Slack App credentials (Client ID + Secret) for this workspace. */
export async function saveSlackCredentialsAction(input: {
  clientId: string;
  clientSecret: string;
}): Promise<SlackActionResult> {
  const context = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return { ok: false, error: "Server encryption key not configured." };
  }

  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();

  if (!clientId || !clientSecret) {
    return { ok: false, error: "Both Client ID and Client Secret are required." };
  }

  const encrypted = encryptSecret(clientSecret);

  const set: Partial<typeof workspaceSettings.$inferInsert> = {
    slackClientId: clientId,
    slackClientSecretCiphertext: encrypted.ciphertext,
    slackClientSecretIv: encrypted.iv,
    slackClientSecretTag: encrypted.tag,
    updatedAt: new Date(),
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, ...set })
    .onConflictDoUpdate({ target: workspaceSettings.organizationId, set });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** List channels the bot can post to. */
export async function listSlackChannelsAction(): Promise<
  { ok: true; channels: SlackChannel[] } | { ok: false; error: string }
> {
  const context = await requirePermission("integrations:manage");
  const config = await getWorkspaceSlackConfig(context.organization.id);
  if (!config) return { ok: false, error: "Slack not connected." };

  try {
    const client = new WebClient(config.botToken);
    const result = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
    });

    const channels: SlackChannel[] = (result.channels ?? [])
      .filter((c) => c.id && c.name)
      .map((c) => ({ id: c.id!, name: c.name! }));

    return { ok: true, channels };
  } catch {
    return { ok: false, error: "Failed to fetch channels from Slack." };
  }
}

/** Save the selected channel and events. */
export async function saveSlackSettingsAction(input: {
  channelId: string;
  channelName: string;
  events: string[];
  enabled: boolean;
}): Promise<SlackActionResult> {
  const context = await requirePermission("integrations:manage");

  const cleanEvents = input.events.filter(isWebhookEvent);

  await db
    .update(workspaceSettings)
    .set({
      slackEnabled: input.enabled,
      slackChannelId: input.channelId,
      slackChannelName: input.channelName,
      slackEvents: cleanEvents,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Disconnect Slack: revoke token and clear all slack columns. */
export async function disconnectSlackAction(): Promise<SlackActionResult> {
  const context = await requirePermission("integrations:manage");
  const config = await getWorkspaceSlackConfig(context.organization.id);

  // Best-effort revoke
  if (config) {
    try {
      const client = new WebClient(config.botToken);
      await client.auth.revoke();
    } catch {
      // Token may already be invalid — continue cleanup
    }
  }

  await db
    .update(workspaceSettings)
    .set({
      slackEnabled: false,
      slackTeamId: null,
      slackTeamName: null,
      slackChannelId: null,
      slackChannelName: null,
      slackBotTokenCiphertext: null,
      slackBotTokenIv: null,
      slackBotTokenTag: null,
      slackEvents: [],
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Send a test message to the configured channel. */
export async function testSlackAction(): Promise<SlackActionResult> {
  const context = await requirePermission("integrations:manage");
  const config = await getWorkspaceSlackConfig(context.organization.id);
  if (!config) return { ok: false, error: "Slack not connected." };

  try {
    const client = new WebClient(config.botToken);
    await client.chat.postMessage({
      channel: config.channelId,
      text: "Test message from Harly",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "👋 *Test from Harly* — Your Slack integration is working!",
          },
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: "This is a test notification. Real events will appear here." },
          ],
        },
      ],
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    return { ok: false, error: msg };
  }
}
