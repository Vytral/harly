import "server-only";

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import {
  CREDENTIALS_UNREADABLE_MESSAGE,
  classifyIntegrationError,
  safeErrorFields,
  sanitizeIntegrationError,
} from "@/features/integrations/health/model";
import {
  recordIntegrationFailure,
  recordIntegrationSuccess,
} from "@/features/integrations/health/repository";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";

import { withProviderRefreshLock, type RefreshTransaction } from "@/server/provider-refresh-lock";

import { getZoomCredentials, type ZoomCredentials } from "./config";

const log = createLogger("zoom-oauth");

const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";
const REFRESH_TIMEOUT_MS = 15_000;

/** Delays before the 2nd and 3rd persist attempts. Held under the refresh lock. */
const PERSIST_RETRY_DELAYS_MS = [50, 150];

const PENDING_PERSIST_MESSAGE =
  "Zoom issued new tokens that are not saved yet. Saving them again on the next call.";

export type ZoomRefreshResult =
  | { ok: true; accessToken: string }
  | {
      ok: false;
      reason: "no_credentials" | "no_refresh_token" | "unreadable" | "auth" | "transient" | "other";
      error: string;
    };

type ZoomTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  reason?: string;
};

type SealedValue = { ciphertext: string; iv: string; tag: string };

/**
 * A rotated pair Zoom issued that this process could not persist. Zoom already
 * invalidated the spent refresh token, so the pair is kept (encrypted) and saved
 * before the stored token is ever used again.
 */
type PendingRotation = {
  /** SHA-256 of the spent refresh token: the stored token must still match it to save this pair. */
  spentRefreshDigest: string;
  accessToken: SealedValue;
  refreshToken: SealedValue;
};

const pendingRotations = new Map<string, PendingRotation>();

/**
 * Concurrent calls for one workspace share a single refresh. Zoom rotates the
 * refresh token on every use, so two overlapping refreshes would invalidate
 * each other's token.
 */
const inflightRefreshes = new Map<string, Promise<ZoomRefreshResult>>();

/**
 * Exchange the stored refresh token for a new access/refresh pair (OAuth
 * `grant_type=refresh_token`), persist both encrypted, and record the outcome.
 * A failed refresh is recorded as `needs_reconnect` for auth errors.
 */
export function refreshZoomAccessToken(workspaceId: string): Promise<ZoomRefreshResult> {
  const existing = inflightRefreshes.get(workspaceId);
  if (existing) return existing;
  const refresh = performZoomRefresh(workspaceId).finally(() => {
    inflightRefreshes.delete(workspaceId);
  });
  inflightRefreshes.set(workspaceId, refresh);
  return refresh;
}

type StoredZoomTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  /** The stored refresh token exists but cannot be decrypted. */
  refreshUnreadable: boolean;
};

type ExchangeOutcome =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; error: unknown };

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function seal(value: string): SealedValue {
  return encryptSecret(value);
}

async function performZoomRefresh(workspaceId: string): Promise<ZoomRefreshResult> {
  const credentials = await getZoomCredentials(workspaceId);
  if (!credentials) {
    return { ok: false, reason: "no_credentials", error: "Zoom credentials are not configured." };
  }

  // A rotated pair from an earlier call is saved first, so the stored token is
  // never exchanged while it is known to be spent.
  const pending = pendingRotations.get(workspaceId);
  if (pending) {
    const flushed = await flushPendingRotation(workspaceId, pending);
    if (flushed === "failed") {
      await recordIntegrationFailure(workspaceId, "zoom", PENDING_PERSIST_MESSAGE, {
        kind: "transient",
        forceState: "degraded",
      });
      return { ok: true, accessToken: decryptSecret(pending.accessToken) };
    }
    pendingRotations.delete(workspaceId);
  }

  // The pair read before waiting for the lock. If the stored refresh token
  // changes while this process waits, another process already rotated it.
  const observed = await readStoredZoomTokens(workspaceId, db);
  if (observed.refreshUnreadable) return failUnreadable(workspaceId);
  if (!observed.refreshToken) {
    const error = "Zoom refresh token is missing. Reconnect Zoom.";
    await recordIntegrationFailure(workspaceId, "zoom", error, { kind: "auth" });
    return { ok: false, reason: "no_refresh_token", error };
  }

  const outcome = await withProviderRefreshLock(workspaceId, "zoom", async (tx) => {
    const current = await readStoredZoomTokens(workspaceId, tx);
    if (current.refreshUnreadable) {
      return { kind: "unreadable" as const };
    }
    if (!current.refreshToken) {
      return { kind: "missing" as const };
    }
    if (current.refreshToken !== observed.refreshToken && current.accessToken) {
      return { kind: "rotated_elsewhere" as const, accessToken: current.accessToken };
    }
    const exchanged = await exchangeZoomRefreshToken(credentials, current.refreshToken);
    if (!exchanged.ok) return { kind: "exchange_failed" as const, error: exchanged.error };

    const persisted = await persistWithRetry(tx, workspaceId, exchanged.accessToken, exchanged.refreshToken);
    if (!persisted.ok) {
      // Zoom has already issued the new pair and spent the old one. Keep the
      // new pair for the next call instead of discarding it.
      pendingRotations.set(workspaceId, {
        spentRefreshDigest: digest(current.refreshToken),
        accessToken: seal(exchanged.accessToken),
        refreshToken: seal(exchanged.refreshToken),
      });
      return { kind: "unpersisted" as const, accessToken: exchanged.accessToken, error: persisted.error };
    }
    return { kind: "rotated" as const, accessToken: exchanged.accessToken };
  });

  if (outcome.kind === "unreadable") return failUnreadable(workspaceId);
  if (outcome.kind === "missing") {
    const error = "Zoom refresh token is missing. Reconnect Zoom.";
    await recordIntegrationFailure(workspaceId, "zoom", error, { kind: "auth" });
    return { ok: false, reason: "no_refresh_token", error };
  }
  if (outcome.kind === "exchange_failed") {
    return failRefresh(workspaceId, outcome.error);
  }
  if (outcome.kind === "unpersisted") {
    log.error(
      { err: safeErrorFields(outcome.error) },
      "Failed to persist rotated Zoom tokens; keeping them for the next call",
    );
    await recordIntegrationFailure(workspaceId, "zoom", PENDING_PERSIST_MESSAGE, {
      kind: "transient",
      forceState: "degraded",
    });
    return { ok: true, accessToken: outcome.accessToken };
  }
  await recordIntegrationSuccess(workspaceId, "zoom");
  return { ok: true, accessToken: outcome.accessToken };
}

/**
 * Save the pending pair while holding the lock. It is saved only while the
 * stored token is still the spent one; otherwise another writer has already
 * stored a newer pair and this one is dropped.
 */
async function flushPendingRotation(
  workspaceId: string,
  pending: PendingRotation,
): Promise<"persisted" | "superseded" | "failed"> {
  return withProviderRefreshLock(workspaceId, "zoom", async (tx) => {
    const current = await readStoredZoomTokens(workspaceId, tx);
    if (
      current.refreshUnreadable ||
      !current.refreshToken ||
      digest(current.refreshToken) !== pending.spentRefreshDigest
    ) {
      return "superseded" as const;
    }
    const persisted = await persistWithRetry(
      tx,
      workspaceId,
      decryptSecret(pending.accessToken),
      decryptSecret(pending.refreshToken),
    );
    if (!persisted.ok) {
      log.error(
        { err: safeErrorFields(persisted.error) },
        "Saving pending rotated Zoom tokens failed again",
      );
      return "failed" as const;
    }
    return "persisted" as const;
  });
}

/**
 * Persist a rotated pair, up to three attempts. Each attempt runs in a savepoint
 * so a failed statement does not abort the surrounding transaction.
 */
async function persistWithRetry(
  tx: RefreshTransaction,
  workspaceId: string,
  accessToken: string,
  refreshToken: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= PERSIST_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, PERSIST_RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      await tx.transaction((savepoint) =>
        persistZoomTokens(workspaceId, accessToken, refreshToken, savepoint),
      );
      return { ok: true };
    } catch (error) {
      lastError = error;
    }
  }
  return { ok: false, error: lastError };
}

async function failUnreadable(workspaceId: string): Promise<ZoomRefreshResult> {
  await recordIntegrationFailure(workspaceId, "zoom", CREDENTIALS_UNREADABLE_MESSAGE, {
    kind: "other",
    forceState: "error",
  });
  return { ok: false, reason: "unreadable", error: CREDENTIALS_UNREADABLE_MESSAGE };
}

/** One network exchange of a refresh token. Never persists anything. */
async function exchangeZoomRefreshToken(
  credentials: ZoomCredentials,
  refreshToken: string,
): Promise<ExchangeOutcome> {
  try {
    const response = await fetch(ZOOM_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as ZoomTokenResponse | null;
    if (!response.ok || !body?.access_token) {
      const detail = body?.error ?? body?.reason ?? "unknown";
      return {
        ok: false,
        error: Object.assign(
          new Error(`Zoom token refresh failed (${response.status}): ${detail}`),
          { status: response.status },
        ),
      };
    }
    return {
      ok: true,
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? refreshToken,
    };
  } catch (error) {
    return { ok: false, error };
  }
}

async function failRefresh(workspaceId: string, error: unknown): Promise<ZoomRefreshResult> {
  const classification = classifyIntegrationError("zoom", error);
  await recordIntegrationFailure(workspaceId, "zoom", error, { kind: classification.kind });
  const message = sanitizeIntegrationError(error);
  return {
    ok: false,
    reason: classification.kind,
    error: classification.kind === "auth" ? "Zoom authorization expired. Reconnect Zoom." : message,
  };
}

async function readStoredZoomTokens(
  workspaceId: string,
  executor: Pick<typeof db, "select">,
): Promise<StoredZoomTokens> {
  const [row] = await executor
    .select({
      accessCiphertext: workspaceSettings.zoomTokenCiphertext,
      accessIv: workspaceSettings.zoomTokenIv,
      accessTag: workspaceSettings.zoomTokenTag,
      refreshCiphertext: workspaceSettings.zoomRefreshTokenCiphertext,
      refreshIv: workspaceSettings.zoomRefreshTokenIv,
      refreshTag: workspaceSettings.zoomRefreshTokenTag,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  // An unreadable access token is simply replaced by the refresh below. An
  // unreadable refresh token is a configuration problem, not a dead login.
  const access = openSecret(row?.accessCiphertext, row?.accessIv, row?.accessTag);
  const refresh = openSecret(row?.refreshCiphertext, row?.refreshIv, row?.refreshTag);
  return {
    accessToken: access.value,
    refreshToken: refresh.value,
    refreshUnreadable: !refresh.ok,
  };
}

type OpenedSecret = { ok: true; value: string | null } | { ok: false; value: null };

/** Decrypt one stored secret. Absent is `ok` with no value; present but unreadable is not `ok`. */
function openSecret(
  ciphertext: string | null | undefined,
  iv: string | null | undefined,
  tag: string | null | undefined,
): OpenedSecret {
  if (!ciphertext) return { ok: true, value: null };
  if (!iv || !tag || !isEncryptionConfigured()) return { ok: false, value: null };
  try {
    return { ok: true, value: decryptSecret({ ciphertext, iv, tag }) };
  } catch {
    return { ok: false, value: null };
  }
}

async function persistZoomTokens(
  workspaceId: string,
  accessToken: string,
  refreshToken: string,
  executor: Pick<typeof db, "update">,
): Promise<void> {
  const encryptedAccess = encryptSecret(accessToken);
  const encryptedRefresh = encryptSecret(refreshToken);
  await executor
    .update(workspaceSettings)
    .set({
      zoomTokenCiphertext: encryptedAccess.ciphertext,
      zoomTokenIv: encryptedAccess.iv,
      zoomTokenTag: encryptedAccess.tag,
      zoomRefreshTokenCiphertext: encryptedRefresh.ciphertext,
      zoomRefreshTokenIv: encryptedRefresh.iv,
      zoomRefreshTokenTag: encryptedRefresh.tag,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, workspaceId));
}
