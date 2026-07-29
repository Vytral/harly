"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { WebClient } from "@slack/web-api";

import { db, slackDeliveries, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import {
  getWorkspaceSlackBotToken,
  getWorkspaceSlackConfig,
} from "@/lib/slack/config";
import { isWebhookEvent } from "@/server/webhooks/events";
import { logAuditEvent } from "@/lib/audit-log";
import { dispatchDueSlack } from "@/server/notify/slack";

const log = createLogger("workspace-slack-settings");

export type SlackActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

export type SlackChannel = { id: string; name: string };
export type SlackDeliveryView = {
  id: string;
  event: string;
  channelId: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

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
      slackLastValidatedAt: null,
      slackRevokedAt: new Date(),
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
  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "integration.slack.credentials_saved",
    resourceType: "slack_installation",
    severity: "warning",
  });
  return { ok: true };
}

/** List channels the bot can post to. */
export async function listSlackChannelsAction(): Promise<
  { ok: true; channels: SlackChannel[] } | { ok: false; error: string }
> {
  const context = await requirePermission("integrations:manage");
  const botToken = await getWorkspaceSlackBotToken(context.organization.id);
  if (!botToken) return { ok: false, error: "Slack not connected." };

  try {
    const client = new WebClient(botToken);
    const channels: SlackChannel[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    do {
      const result = await client.conversations.list({
        types: "public_channel,private_channel",
        exclude_archived: true,
        limit: 200,
        cursor,
      });
      channels.push(
        ...(result.channels ?? [])
          .filter((c) => c.id && c.name && c.is_member === true)
          .map((c) => ({ id: c.id!, name: c.name! })),
      );
      cursor = result.response_metadata?.next_cursor || undefined;
      pageCount += 1;
    } while (cursor && channels.length < 1000 && pageCount < 10);

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
  if (input.enabled && cleanEvents.length === 0) {
    return { ok: false, error: "Select at least one Slack event before enabling notifications." };
  }

  if (input.enabled) {
    const botToken = await getWorkspaceSlackBotToken(context.organization.id);
    if (!botToken) return { ok: false, error: "Slack is not connected." };
    try {
      const client = new WebClient(botToken);
      const result = await client.conversations.info({ channel: input.channelId });
      if (!result.channel?.id || result.channel.id !== input.channelId || result.channel.is_member !== true) {
        return { ok: false, error: "The Harly bot must be a member of the selected channel." };
      }
      input = { ...input, channelName: result.channel.name ?? input.channelName };
    } catch (error) {
      log.error(error, "saveSlackSettingsAction channel validation failed");
      if (isDeadSlackToken(error)) {
        await clearSlackToken(context.organization.id);
        return { ok: false, error: RECONNECT_MESSAGE };
      }
      return { ok: false, error: "Could not validate the selected Slack channel." };
    }
  }

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
  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "integration.slack.settings_updated",
    resourceType: "slack_installation",
    metadata: { channelId: input.channelId, eventCount: cleanEvents.length, enabled: input.enabled },
  });
  return { ok: true };
}

/** Disconnect Slack: revoke token and clear all slack columns. */
export async function disconnectSlackAction(): Promise<SlackActionResult> {
  const context = await requirePermission("integrations:manage");
  const botToken = await getWorkspaceSlackBotToken(context.organization.id);

  // Best-effort revoke
  if (botToken) {
    try {
      const client = new WebClient(botToken);
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
  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "integration.slack.disconnected",
    resourceType: "slack_installation",
    severity: "warning",
  });
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

export async function listSlackDeliveriesAction(): Promise<
  { ok: true; deliveries: SlackDeliveryView[] } | { ok: false; error: string }
> {
  const context = await requirePermission("integrations:manage");
  const rows = await db
    .select({
      id: slackDeliveries.id,
      event: slackDeliveries.event,
      channelId: slackDeliveries.channelId,
      status: slackDeliveries.status,
      attempts: slackDeliveries.attempts,
      lastError: slackDeliveries.lastError,
      createdAt: slackDeliveries.createdAt,
      deliveredAt: slackDeliveries.deliveredAt,
    })
    .from(slackDeliveries)
    .where(eq(slackDeliveries.workspaceId, context.organization.id))
    .orderBy(desc(slackDeliveries.createdAt))
    .limit(20);

  return {
    ok: true,
    deliveries: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
    })),
  };
}

export async function replaySlackDeliveryAction(
  deliveryId: string,
): Promise<SlackActionResult> {
  const context = await requirePermission("integrations:manage");
  const [source] = await db
    .select()
    .from(slackDeliveries)
    .where(eq(slackDeliveries.id, deliveryId))
    .limit(1);
  if (!source || source.workspaceId !== context.organization.id) {
    return { ok: false, error: "Slack delivery not found." };
  }
  if (source.status !== "failed" && source.status !== "dead_letter") {
    return { ok: false, error: "Only failed Slack deliveries can be replayed." };
  }

  const [replay] = await db
    .insert(slackDeliveries)
    .values({
      workspaceId: source.workspaceId,
      event: source.event,
      channelId: source.channelId,
      payload: source.payload,
      status: "pending",
      replayOfId: source.id,
    })
    .returning({ id: slackDeliveries.id });
  if (replay) {
    void dispatchDueSlack(1, [replay.id]).catch((error) =>
      log.error(error, "Slack replay dispatch failed"),
    );
  }

  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "integration.slack.delivery_replayed",
    resourceType: "slack_delivery",
    resourceId: source.id,
    metadata: { event: source.event, channelId: source.channelId },
  });
  return { ok: true };
}
