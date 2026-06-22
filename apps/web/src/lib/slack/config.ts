import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { isWebhookEvent, type WebhookEvent } from "@/server/webhooks/events";

export type WorkspaceSlackStatus = {
  enabled: boolean;
  teamId: string | null;
  teamName: string | null;
  channelId: string | null;
  channelName: string | null;
  hasToken: boolean;
  hasCredentials: boolean;
  events: WebhookEvent[];
  encryptionReady: boolean;
};

export type SlackConfig = {
  botToken: string;
  channelId: string;
  events: WebhookEvent[];
};

export type SlackCredentials = {
  clientId: string;
  clientSecret: string;
};

function toEvents(raw: unknown): WebhookEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is WebhookEvent => typeof v === "string" && isWebhookEvent(v),
  );
}

/** Public-safe status for the settings UI. Never returns secrets. */
export async function getWorkspaceSlackStatus(
  workspaceId: string,
): Promise<WorkspaceSlackStatus> {
  const [row] = await db
    .select({
      slackEnabled: workspaceSettings.slackEnabled,
      slackTeamId: workspaceSettings.slackTeamId,
      slackTeamName: workspaceSettings.slackTeamName,
      slackChannelId: workspaceSettings.slackChannelId,
      slackChannelName: workspaceSettings.slackChannelName,
      slackBotTokenCiphertext: workspaceSettings.slackBotTokenCiphertext,
      slackClientId: workspaceSettings.slackClientId,
      slackClientSecretCiphertext: workspaceSettings.slackClientSecretCiphertext,
      slackEvents: workspaceSettings.slackEvents,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  const hasDbCredentials = Boolean(
    row?.slackClientId && row?.slackClientSecretCiphertext,
  );
  const hasEnvCredentials = Boolean(
    process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET,
  );

  return {
    enabled: Boolean(row?.slackEnabled),
    teamId: row?.slackTeamId ?? null,
    teamName: row?.slackTeamName ?? null,
    channelId: row?.slackChannelId ?? null,
    channelName: row?.slackChannelName ?? null,
    hasToken: Boolean(row?.slackBotTokenCiphertext),
    hasCredentials: hasDbCredentials || hasEnvCredentials,
    events: toEvents(row?.slackEvents),
    encryptionReady: isEncryptionConfigured(),
  };
}

/**
 * Resolve OAuth credentials for a workspace. Priority: DB (per-workspace) > env (global).
 * Returns null if neither is configured.
 */
export async function getWorkspaceSlackCredentials(
  workspaceId: string,
): Promise<SlackCredentials | null> {
  const [row] = await db
    .select({
      slackClientId: workspaceSettings.slackClientId,
      slackClientSecretCiphertext: workspaceSettings.slackClientSecretCiphertext,
      slackClientSecretIv: workspaceSettings.slackClientSecretIv,
      slackClientSecretTag: workspaceSettings.slackClientSecretTag,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  // Try workspace-level credentials first
  if (
    row?.slackClientId &&
    row?.slackClientSecretCiphertext &&
    row?.slackClientSecretIv &&
    row?.slackClientSecretTag
  ) {
    try {
      const clientSecret = decryptSecret({
        ciphertext: row.slackClientSecretCiphertext,
        iv: row.slackClientSecretIv,
        tag: row.slackClientSecretTag,
      });
      return { clientId: row.slackClientId, clientSecret };
    } catch {
      // Fall through to env
    }
  }

  // Fallback: global env vars (self-hosted single-tenant)
  if (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET) {
    return {
      clientId: process.env.SLACK_CLIENT_ID,
      clientSecret: process.env.SLACK_CLIENT_SECRET,
    };
  }

  return null;
}

/**
 * Resolve a usable Slack config (with decrypted bot token) for a workspace,
 * or null when disabled / unconfigured.
 */
export async function getWorkspaceSlackConfig(
  workspaceId: string,
): Promise<SlackConfig | null> {
  if (!isEncryptionConfigured()) return null;

  const [row] = await db
    .select({
      slackEnabled: workspaceSettings.slackEnabled,
      slackChannelId: workspaceSettings.slackChannelId,
      slackBotTokenCiphertext: workspaceSettings.slackBotTokenCiphertext,
      slackBotTokenIv: workspaceSettings.slackBotTokenIv,
      slackBotTokenTag: workspaceSettings.slackBotTokenTag,
      slackEvents: workspaceSettings.slackEvents,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    !row ||
    !row.slackEnabled ||
    !row.slackChannelId ||
    !row.slackBotTokenCiphertext ||
    !row.slackBotTokenIv ||
    !row.slackBotTokenTag
  ) {
    return null;
  }

  try {
    const botToken = decryptSecret({
      ciphertext: row.slackBotTokenCiphertext,
      iv: row.slackBotTokenIv,
      tag: row.slackBotTokenTag,
    });

    return {
      botToken,
      channelId: row.slackChannelId,
      events: toEvents(row.slackEvents),
    };
  } catch {
    return null;
  }
}
