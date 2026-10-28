import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import {
  classifyIntegrationError,
} from "@/features/integrations/health/model";
import {
  recordIntegrationFailure,
  recordIntegrationSuccess,
} from "@/features/integrations/health/repository";
import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { isWebhookEvent, type WebhookEvent } from "@/server/webhooks/events";

import { refreshOutlookToken } from "./client";

const log = createLogger("outlook-config");

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

type OutlookTokenPair = { accessToken: string; refreshToken: string };

/**
 * Concurrent callers share one refresh per workspace, so a burst of
 * notifications does not rotate the refresh token several times at once.
 */
const inflightOutlookRefreshes = new Map<string, Promise<OutlookTokenPair | null>>();

/**
 * Clear a dead Outlook connection exactly like the manual settings actions do
 * (disable, drop both tokens) and record the reason for the UI.
 */
export async function invalidateWorkspaceOutlookConnection(
  workspaceId: string,
  error: unknown,
): Promise<void> {
  try {
    await db
      .update(workspaceSettings)
      .set({
        outlookEnabled: false,
        outlookAccessTokenCiphertext: null,
        outlookAccessTokenIv: null,
        outlookAccessTokenTag: null,
        outlookRefreshTokenCiphertext: null,
        outlookRefreshTokenIv: null,
        outlookRefreshTokenTag: null,
        updatedAt: new Date(),
      })
      .where(eq(workspaceSettings.organizationId, workspaceId));
  } catch (clearError) {
    log.error({ err: clearError }, "Failed to clear revoked Outlook tokens");
  }
  await recordIntegrationFailure(workspaceId, "outlook", error, { kind: "auth" });
}

/**
 * Record a failed Microsoft Graph call from a background path. Auth failures
 * clear the dead connection; other failures are classified and counted.
 * Returns true when the failure was an auth failure.
 */
export async function recordOutlookCallFailure(
  workspaceId: string,
  error: unknown,
): Promise<boolean> {
  if (classifyIntegrationError("outlook", error).kind === "auth") {
    await invalidateWorkspaceOutlookConnection(workspaceId, error);
    return true;
  }
  await recordIntegrationFailure(workspaceId, "outlook", error);
  return false;
}

/**
 * Microsoft access tokens last about an hour and the stored one is never
 * refreshed on its own, so every config read exchanges the refresh token.
 * Returns null when Microsoft revoked the grant (the connection is cleared and
 * flagged). A transient failure falls back to the stored access token.
 */
async function freshOutlookTokens(
  workspaceId: string,
  stored: OutlookTokenPair,
): Promise<OutlookTokenPair | null> {
  const inflight = inflightOutlookRefreshes.get(workspaceId);
  if (inflight) return inflight;
  const refresh = refreshStoredOutlookTokens(workspaceId, stored).finally(() => {
    inflightOutlookRefreshes.delete(workspaceId);
  });
  inflightOutlookRefreshes.set(workspaceId, refresh);
  return refresh;
}

async function refreshStoredOutlookTokens(
  workspaceId: string,
  stored: OutlookTokenPair,
): Promise<OutlookTokenPair | null> {
  const credentials = await getWorkspaceOutlookCredentials(workspaceId);
  if (!credentials) return stored;

  try {
    const fresh = await refreshOutlookToken({
      workspaceId,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken: stored.refreshToken,
    });
    await recordIntegrationSuccess(workspaceId, "outlook");
    return fresh;
  } catch (error) {
    log.error({ err: error }, "Outlook token refresh failed");
    const revoked = await recordOutlookCallFailure(workspaceId, error);
    return revoked ? null : stored;
  }
}

/**
 * Resolve a usable Outlook config (fresh access token + decrypted refresh
 * token) for a workspace, or null when disabled, unconfigured or revoked.
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

  let stored: OutlookTokenPair;
  try {
    stored = {
      accessToken: decryptSecret({
        ciphertext: row.outlookAccessTokenCiphertext,
        iv: row.outlookAccessTokenIv,
        tag: row.outlookAccessTokenTag,
      }),
      refreshToken: decryptSecret({
        ciphertext: row.outlookRefreshTokenCiphertext,
        iv: row.outlookRefreshTokenIv,
        tag: row.outlookRefreshTokenTag,
      }),
    };
  } catch {
    return null;
  }

  const fresh = await freshOutlookTokens(workspaceId, stored);
  if (!fresh) return null;

  return {
    accessToken: fresh.accessToken,
    refreshToken: fresh.refreshToken,
    calendarId: row.outlookCalendarId,
    events: toEvents(row.outlookEvents),
  };
}
