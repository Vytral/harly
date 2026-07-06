import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { isWebhookEvent, type WebhookEvent } from "@/server/webhooks/events";

export type WorkspaceOutlookStatus = {
  enabled: boolean;
  accountEmail: string | null;
  hasToken: boolean;
  hasCredentials: boolean;
  calendarId: string | null;
  events: WebhookEvent[];
  encryptionReady: boolean;
};

export type OutlookConfig = {
  accessToken: string;
  refreshToken: string;
  calendarId: string | null;
  events: WebhookEvent[];
};

export type OutlookCredentials = {
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
export async function getWorkspaceOutlookStatus(
  workspaceId: string,
): Promise<WorkspaceOutlookStatus> {
  const [row] = await db
    .select({
      outlookEnabled: workspaceSettings.outlookEnabled,
      outlookAccountEmail: workspaceSettings.outlookAccountEmail,
      outlookAccessTokenCiphertext: workspaceSettings.outlookAccessTokenCiphertext,
      outlookClientId: workspaceSettings.outlookClientId,
      outlookClientSecretCiphertext: workspaceSettings.outlookClientSecretCiphertext,
      outlookCalendarId: workspaceSettings.outlookCalendarId,
      outlookEvents: workspaceSettings.outlookEvents,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  const hasDbCredentials = Boolean(
    row?.outlookClientId && row?.outlookClientSecretCiphertext,
  );
  const hasEnvCredentials = Boolean(
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET,
  );

  return {
    enabled: Boolean(row?.outlookEnabled),
    accountEmail: row?.outlookAccountEmail ?? null,
    hasToken: Boolean(row?.outlookAccessTokenCiphertext),
    hasCredentials: hasDbCredentials || hasEnvCredentials,
    calendarId: row?.outlookCalendarId ?? null,
    events: toEvents(row?.outlookEvents),
    encryptionReady: isEncryptionConfigured(),
  };
}

/**
 * Resolve OAuth credentials for a workspace. Priority: DB (per-workspace) > env (global).
 * Returns null if neither is configured.
 */
export async function getWorkspaceOutlookCredentials(
  workspaceId: string,
): Promise<OutlookCredentials | null> {
  const [row] = await db
    .select({
      outlookClientId: workspaceSettings.outlookClientId,
      outlookClientSecretCiphertext: workspaceSettings.outlookClientSecretCiphertext,
      outlookClientSecretIv: workspaceSettings.outlookClientSecretIv,
      outlookClientSecretTag: workspaceSettings.outlookClientSecretTag,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  // Try workspace-level credentials first
  if (
    row?.outlookClientId &&
    row?.outlookClientSecretCiphertext &&
    row?.outlookClientSecretIv &&
    row?.outlookClientSecretTag
  ) {
    try {
      const clientSecret = decryptSecret({
        ciphertext: row.outlookClientSecretCiphertext,
        iv: row.outlookClientSecretIv,
        tag: row.outlookClientSecretTag,
      });
      return { clientId: row.outlookClientId, clientSecret };
    } catch {
      // Fall through to env
    }
  }

  // Fallback: global env vars (self-hosted single-tenant)
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    return {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    };
  }

  return null;
}

/**
 * Resolve a usable Outlook config (with decrypted tokens) for a workspace,
 * or null when disabled / unconfigured.
 */
export async function getWorkspaceOutlookConfig(
  workspaceId: string,
): Promise<OutlookConfig | null> {
  if (!isEncryptionConfigured()) return null;

  const [row] = await db
    .select({
      outlookEnabled: workspaceSettings.outlookEnabled,
      outlookAccessTokenCiphertext: workspaceSettings.outlookAccessTokenCiphertext,
      outlookAccessTokenIv: workspaceSettings.outlookAccessTokenIv,
      outlookAccessTokenTag: workspaceSettings.outlookAccessTokenTag,
      outlookRefreshTokenCiphertext: workspaceSettings.outlookRefreshTokenCiphertext,
      outlookRefreshTokenIv: workspaceSettings.outlookRefreshTokenIv,
      outlookRefreshTokenTag: workspaceSettings.outlookRefreshTokenTag,
      outlookCalendarId: workspaceSettings.outlookCalendarId,
      outlookEvents: workspaceSettings.outlookEvents,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    !row ||
    !row.outlookEnabled ||
    !row.outlookAccessTokenCiphertext ||
    !row.outlookAccessTokenIv ||
    !row.outlookAccessTokenTag ||
    !row.outlookRefreshTokenCiphertext ||
    !row.outlookRefreshTokenIv ||
    !row.outlookRefreshTokenTag
  ) {
    return null;
  }

  try {
    const accessToken = decryptSecret({
      ciphertext: row.outlookAccessTokenCiphertext,
      iv: row.outlookAccessTokenIv,
      tag: row.outlookAccessTokenTag,
    });

    const refreshToken = decryptSecret({
      ciphertext: row.outlookRefreshTokenCiphertext,
      iv: row.outlookRefreshTokenIv,
      tag: row.outlookRefreshTokenTag,
    });

    return {
      accessToken,
      refreshToken,
      calendarId: row.outlookCalendarId,
      events: toEvents(row.outlookEvents),
    };
  } catch {
    return null;
  }
}
