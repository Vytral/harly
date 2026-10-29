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

import { withProviderRefreshLock } from "@/server/provider-refresh-lock";

import {
  persistOutlookTokens,
  requestOutlookRefresh,
  type OutlookTokenPair,
} from "./client";
import {
  openOutlookAccessToken,
  outlookTokenNeedsRefresh,
} from "./token-envelope";

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
 * Concurrent callers in this process share one refresh per workspace. Other
 * processes are covered by the advisory lock in `refreshUnderLock`.
 */
const inflightOutlookRefreshes = new Map<string, Promise<OutlookTokenPair | null>>();

async function freshOutlookTokens(
  workspaceId: string,
  stored: StoredOutlookTokens,
): Promise<OutlookTokenPair | null> {
  const inflight = inflightOutlookRefreshes.get(workspaceId);
  if (inflight) return inflight;
  const refresh = refreshStoredOutlookTokens(workspaceId, stored).finally(() => {
    inflightOutlookRefreshes.delete(workspaceId);
  });
  inflightOutlookRefreshes.set(workspaceId, refresh);
  return refresh;
}

type StoredOutlookTokens = {
  accessToken: string;
  accessExpiresAt: Date | null;
  refreshToken: string;
  calendarId: string | null;
  events: WebhookEvent[];
};

/**
 * Refresh under the cross-process lock. Microsoft rotates the refresh token on
 * every use, so the token is re-read after the lock is taken: if another
 * process already refreshed while this one waited, its result is used and no
 * second exchange is made.
 */
async function refreshUnderLock(
  workspaceId: string,
  credentials: OutlookCredentials,
): Promise<{ kind: "disconnected" } | { kind: "current"; tokens: OutlookTokenPair } | { kind: "refreshed"; tokens: OutlookTokenPair }> {
  return withProviderRefreshLock(workspaceId, "outlook", async (tx) => {
    const current = await readStoredOutlookTokens(workspaceId, tx);
    if (!current) return { kind: "disconnected" as const };
    if (!outlookTokenNeedsRefresh(current.accessExpiresAt)) {
      return { kind: "current" as const, tokens: toPair(current) };
    }
    const tokens = await requestOutlookRefresh({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken: current.refreshToken,
    });
    await persistOutlookTokens(workspaceId, tokens, tx);
    return { kind: "refreshed" as const, tokens };
  });
}

function toPair(tokens: StoredOutlookTokens): OutlookTokenPair {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.accessExpiresAt,
  };
}

async function refreshStoredOutlookTokens(
  workspaceId: string,
  stored: StoredOutlookTokens,
): Promise<OutlookTokenPair | null> {
  const credentials = await getWorkspaceOutlookCredentials(workspaceId);
  if (!credentials) return toPair(stored);

  try {
    const outcome = await refreshUnderLock(workspaceId, credentials);
    if (outcome.kind === "disconnected") return null;
    await recordIntegrationSuccess(workspaceId, "outlook");
    return outcome.tokens;
  } catch (error) {
    log.error({ err: error }, "Outlook token refresh failed");
    const revoked = await recordOutlookCallFailure(workspaceId, error);
    return revoked ? null : toPair(stored);
  }
}

/** Read and decrypt the stored Outlook pair. Null when disabled, incomplete or unreadable. */
async function readStoredOutlookTokens(
  workspaceId: string,
  executor: Pick<typeof db, "select">,
): Promise<StoredOutlookTokens | null> {
  const [row] = await executor
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
    const access = openOutlookAccessToken(
      decryptSecret({
        ciphertext: row.outlookAccessTokenCiphertext,
        iv: row.outlookAccessTokenIv,
        tag: row.outlookAccessTokenTag,
      }),
    );
    return {
      accessToken: access.accessToken,
      accessExpiresAt: access.expiresAt,
      refreshToken: decryptSecret({
        ciphertext: row.outlookRefreshTokenCiphertext,
        iv: row.outlookRefreshTokenIv,
        tag: row.outlookRefreshTokenTag,
      }),
      calendarId: row.outlookCalendarId,
      events: toEvents(row.outlookEvents),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a usable Outlook config (fresh access token + decrypted refresh
 * token) for a workspace, or null when disabled, unconfigured or revoked.
 * Refreshes only when the stored access token is near expiry or its expiry is
 * unknown; a valid token is used as stored, with no network call.
 */
export async function getWorkspaceOutlookConfig(
  workspaceId: string,
): Promise<OutlookConfig | null> {
  if (!isEncryptionConfigured()) return null;

  const stored = await readStoredOutlookTokens(workspaceId, db);
  if (!stored) return null;

  const fresh = outlookTokenNeedsRefresh(stored.accessExpiresAt)
    ? await freshOutlookTokens(workspaceId, stored)
    : toPair(stored);
  if (!fresh) return null;

  return {
    accessToken: fresh.accessToken,
    refreshToken: fresh.refreshToken,
    calendarId: stored.calendarId,
    events: stored.events,
  };
}
