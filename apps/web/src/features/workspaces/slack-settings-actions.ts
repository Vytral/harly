"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { WebClient } from "@slack/web-api";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { getWorkspaceSlackConfig } from "@/lib/slack/config";
import { isWebhookEvent } from "@/server/webhooks/events";

const log = createLogger("workspace-slack-settings");

export type SlackActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

export type SlackChannel = { id: string; name: string };

const RECONNECT_MESSAGE =
  "Slack revoked this connection. Disconnect and add Harly to Slack again.";

/** Slack error codes that mean the stored bot token is permanently dead. */
const DEAD_TOKEN_ERRORS = new Set([
  "invalid_auth",
  "token_revoked",
  "account_inactive",
  "token_expired",
  "not_authed",
]);

/** Slack's WebClient throws errors carrying `data.error` with the API code. */
function slackErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { error?: unknown } }).data;
    if (data && typeof data.error === "string") return data.error;
  }
  return null;
}

function isDeadSlackToken(err: unknown): boolean {
  const code = slackErrorCode(err);
  return code !== null && DEAD_TOKEN_ERRORS.has(code);
}

/** Wipe the dead bot token so status flips back to "not connected". */
async function clearSlackToken(organizationId: string): Promise<void> {
  await db
    .update(workspaceSettings)
    .set({
      slackEnabled: false,
      slackBotTokenCiphertext: null,
      slackBotTokenIv: null,
      slackBotTokenTag: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, organizationId));
  revalidatePath(SETTINGS_PATH);
}

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
  } catch (error) {
    log.error(error, "listSlackChannelsAction failed");
    if (isDeadSlackToken(error)) {
      await clearSlackToken(context.organization.id);
      return { ok: false, error: RECONNECT_MESSAGE };
    }
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
    } catch (error) {
      log.error(error, "disconnectSlackAction revoke failed");
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
            text: "👋 *Test from Harly*. Your Slack integration is working!",
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
    log.error(err, "testSlackAction failed");
    if (isDeadSlackToken(err)) {
      await clearSlackToken(context.organization.id);
      return { ok: false, error: RECONNECT_MESSAGE };
    }
    const msg = err instanceof Error ? err.message : "Send failed";
    return { ok: false, error: msg };
  }
}
