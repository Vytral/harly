import "server-only";

import { and, eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import {
  CREDENTIALS_UNREADABLE_MESSAGE,
  classifyIntegrationError,
  safeErrorFields,
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
  /**
   * The stored refresh-token ciphertext these tokens belong to. A failure from
   * a call made with them only disconnects while this is still the stored one.
   */
  refreshTokenCiphertext: string;
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
 *
 * Compare-and-set: the clear only applies while the stored refresh token is
 * still the one that failed. A call that read an older pair can fail after
 * another process rotated it; that failure must not disable the newer pair.
 * Returns false when the stored pair had already changed.
 */
export async function invalidateWorkspaceOutlookConnection(
  workspaceId: string,
  error: unknown,
  failedRefreshCiphertext: string | null,
): Promise<boolean> {
  if (!failedRefreshCiphertext) return false;
  try {
    const cleared = await db
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
      .where(
        and(
          eq(workspaceSettings.organizationId, workspaceId),
          eq(workspaceSettings.outlookRefreshTokenCiphertext, failedRefreshCiphertext),
        ),
      )
      .returning({ id: workspaceSettings.organizationId });
    if (cleared.length === 0) return false;
  } catch (clearError) {
    log.error({ err: safeErrorFields(clearError) }, "Failed to clear revoked Outlook tokens");
  }
  await recordIntegrationFailure(workspaceId, "outlook", error, { kind: "auth" });
  return true;
}

/**
 * Record a failed Microsoft Graph call from a background path. Auth failures
 * clear the dead connection, but only if it is still the pair the call used.
 * Pass `OutlookConfig.refreshTokenCiphertext`. Without it, the failure applies
 * to the pair stored at that moment, so the call cannot tell a stale pair apart.
 * Returns true when the failure was an auth failure.
 */
export async function recordOutlookCallFailure(
  workspaceId: string,
  error: unknown,
  refreshTokenCiphertext?: string | null,
): Promise<boolean> {
  if (classifyIntegrationError("outlook", error).kind === "auth") {
    const expected = refreshTokenCiphertext ?? (await currentRefreshCiphertext(workspaceId));
    await invalidateWorkspaceOutlookConnection(workspaceId, error, expected);
    return true;
  }
  await recordIntegrationFailure(workspaceId, "outlook", error);
  return false;
}

async function currentRefreshCiphertext(workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ ciphertext: workspaceSettings.outlookRefreshTokenCiphertext })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  return row?.ciphertext ?? null;
}

type StoredOutlookTokens = {
  accessToken: string;
  accessExpiresAt: Date | null;
  refreshToken: string;
  refreshCiphertext: string;
  calendarId: string | null;
  events: WebhookEvent[];
};

type FreshOutlookTokens = {
  pair: OutlookTokenPair;
  /** Stored refresh-token ciphertext that `pair.refreshToken` came from. */
  refreshCiphertext: string;
};

/**
 * Concurrent callers in this process share one refresh per workspace. Other
 * processes are covered by the advisory lock in `refreshUnderLock`.
 */
const inflightOutlookRefreshes = new Map<string, Promise<FreshOutlookTokens | null>>();

async function freshOutlookTokens(
  workspaceId: string,
  stored: StoredOutlookTokens,
): Promise<FreshOutlookTokens | null> {
  const inflight = inflightOutlookRefreshes.get(workspaceId);
  if (inflight) return inflight;
  const refresh = refreshStoredOutlookTokens(workspaceId, stored).finally(() => {
    inflightOutlookRefreshes.delete(workspaceId);
  });
  inflightOutlookRefreshes.set(workspaceId, refresh);
  return refresh;
}

type RefreshOutcome =
  | { kind: "disconnected" }
  | { kind: "current"; tokens: FreshOutlookTokens }
  | { kind: "refreshed"; tokens: FreshOutlookTokens }
  | { kind: "refresh_failed"; error: unknown; refreshCiphertext: string };

/**
 * Refresh under the cross-process lock. Microsoft rotates the refresh token on
 * every use, so the token is re-read after the lock is taken: if another
 * process already refreshed while this one waited, its result is used and no
 * second exchange is made.
 */
async function refreshUnderLock(
  workspaceId: string,
  credentials: OutlookCredentials,
): Promise<RefreshOutcome> {
  return withProviderRefreshLock(workspaceId, "outlook", async (tx) => {
    const current = await readStoredOutlookTokens(workspaceId, tx);
    if (!current) return { kind: "disconnected" as const };
    if (!outlookTokenNeedsRefresh(current.accessExpiresAt)) {
      return {
        kind: "current" as const,
        tokens: { pair: toPair(current), refreshCiphertext: current.refreshCiphertext },
      };
    }
    try {
      const pair = await requestOutlookRefresh({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        refreshToken: current.refreshToken,
      });
      const refreshCiphertext = await persistOutlookTokens(workspaceId, pair, tx);
      return { kind: "refreshed" as const, tokens: { pair, refreshCiphertext } };
    } catch (error) {
      return {
        kind: "refresh_failed" as const,
        error,
        refreshCiphertext: current.refreshCiphertext,
      };
    }
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
): Promise<FreshOutlookTokens | null> {
  const credentials = await getWorkspaceOutlookCredentials(workspaceId);
  if (!credentials) return { pair: toPair(stored), refreshCiphertext: stored.refreshCiphertext };

  const startedAt = new Date();
  const outcome = await refreshUnderLock(workspaceId, credentials).catch(
    (error: unknown): RefreshOutcome => ({
      kind: "refresh_failed",
      error,
      refreshCiphertext: stored.refreshCiphertext,
    }),
  );
  if (outcome.kind === "disconnected") return null;
  if (outcome.kind === "refresh_failed") {
    log.error({ err: safeErrorFields(outcome.error) }, "Outlook token refresh failed");
    const revoked = await recordOutlookCallFailure(
      workspaceId,
      outcome.error,
      outcome.refreshCiphertext,
    );
    if (!revoked) return { pair: toPair(stored), refreshCiphertext: stored.refreshCiphertext };
    // Revoked, unless another writer already stored a newer pair meanwhile.
    const latest = await readStoredOutlookTokens(workspaceId, db);
    return latest ? { pair: toPair(latest), refreshCiphertext: latest.refreshCiphertext } : null;
  }
  await recordIntegrationSuccess(workspaceId, "outlook", { startedAt });
  return outcome.tokens;
}

/**
 * Read and decrypt the stored Outlook pair. Null when disabled or incomplete.
 * Stored credentials that cannot be decrypted (or cannot be read at all while
 * the encryption key is missing) are recorded as an error with the encryption
 * reason. They are not a dead login, so the connection is left in place.
 */
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

  if (!isEncryptionConfigured()) {
    await recordUnreadableCredentials(workspaceId);
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
      refreshCiphertext: row.outlookRefreshTokenCiphertext,
      calendarId: row.outlookCalendarId,
      events: toEvents(row.outlookEvents),
    };
  } catch {
    await recordUnreadableCredentials(workspaceId);
    return null;
  }
}

async function recordUnreadableCredentials(workspaceId: string): Promise<void> {
  await recordIntegrationFailure(workspaceId, "outlook", CREDENTIALS_UNREADABLE_MESSAGE, {
    kind: "other",
    forceState: "error",
  });
}

/**
 * Resolve a usable Outlook config (fresh access token + decrypted refresh
 * token) for a workspace, or null when disabled, unconfigured, revoked or
 * unreadable. Refreshes only when the stored access token is near expiry or its
 * expiry is unknown; a valid token is used as stored, with no network call.
 */
export async function getWorkspaceOutlookConfig(
  workspaceId: string,
): Promise<OutlookConfig | null> {
  const stored = await readStoredOutlookTokens(workspaceId, db);
  if (!stored) return null;

  const fresh = outlookTokenNeedsRefresh(stored.accessExpiresAt)
    ? await freshOutlookTokens(workspaceId, stored)
    : { pair: toPair(stored), refreshCiphertext: stored.refreshCiphertext };
  if (!fresh) return null;

  return {
    accessToken: fresh.pair.accessToken,
    refreshToken: fresh.pair.refreshToken,
    refreshTokenCiphertext: fresh.refreshCiphertext,
    calendarId: stored.calendarId,
    events: stored.events,
  };
}
