import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import {
  classifyIntegrationError,
  sanitizeIntegrationError,
} from "@/features/integrations/health/model";
import {
  recordIntegrationFailure,
  recordIntegrationSuccess,
} from "@/features/integrations/health/repository";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";

import { withProviderRefreshLock } from "@/server/provider-refresh-lock";

import { getZoomCredentials, type ZoomCredentials } from "./config";

const log = createLogger("zoom-oauth");

const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";
const REFRESH_TIMEOUT_MS = 15_000;

export type ZoomRefreshResult =
  | { ok: true; accessToken: string }
  | {
      ok: false;
      reason: "no_credentials" | "no_refresh_token" | "auth" | "transient" | "other";
      error: string;
    };

type ZoomTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  reason?: string;
};

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

type StoredZoomTokens = { accessToken: string | null; refreshToken: string | null };

type ExchangeOutcome =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; error: unknown };

async function performZoomRefresh(workspaceId: string): Promise<ZoomRefreshResult> {
  const credentials = await getZoomCredentials(workspaceId);
  if (!credentials) {
    return { ok: false, reason: "no_credentials", error: "Zoom credentials are not configured." };
  }

  // The pair read before waiting for the lock. If the stored refresh token
  // changes while this process waits, another process already rotated it.
  const observed = await readStoredZoomTokens(workspaceId, db);
  if (!observed.refreshToken) {
    const error = "Zoom refresh token is missing. Reconnect Zoom.";
    await recordIntegrationFailure(workspaceId, "zoom", error, { kind: "auth" });
    return { ok: false, reason: "no_refresh_token", error };
  }

  const outcome = await withProviderRefreshLock(workspaceId, "zoom", async (tx) => {
    const current = await readStoredZoomTokens(workspaceId, tx);
    if (!current.refreshToken) {
      return { kind: "missing" as const };
    }
    if (current.refreshToken !== observed.refreshToken && current.accessToken) {
      return { kind: "rotated_elsewhere" as const, accessToken: current.accessToken };
    }
    const exchanged = await exchangeZoomRefreshToken(credentials, current.refreshToken);
    if (!exchanged.ok) return { kind: "exchange_failed" as const, error: exchanged.error };
    try {
      await persistZoomTokens(workspaceId, exchanged.accessToken, exchanged.refreshToken, tx);
    } catch (error) {
      // The rotated pair is already issued; without persisting it the
      // connection cannot refresh again, so surface it as a failure.
      log.error({ err: error }, "Failed to persist rotated Zoom tokens");
      return { kind: "exchange_failed" as const, error };
    }
    return { kind: "rotated" as const, accessToken: exchanged.accessToken };
  });

  if (outcome.kind === "missing") {
    const error = "Zoom refresh token is missing. Reconnect Zoom.";
    await recordIntegrationFailure(workspaceId, "zoom", error, { kind: "auth" });
    return { ok: false, reason: "no_refresh_token", error };
  }
  if (outcome.kind === "exchange_failed") {
    return failRefresh(workspaceId, outcome.error);
  }
  await recordIntegrationSuccess(workspaceId, "zoom");
  return { ok: true, accessToken: outcome.accessToken };
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
  if (!isEncryptionConfigured()) return { accessToken: null, refreshToken: null };
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
  return {
    accessToken: openSecret(row?.accessCiphertext, row?.accessIv, row?.accessTag),
    refreshToken: openSecret(row?.refreshCiphertext, row?.refreshIv, row?.refreshTag),
  };
}

function openSecret(
  ciphertext: string | null | undefined,
  iv: string | null | undefined,
  tag: string | null | undefined,
): string | null {
  if (!ciphertext || !iv || !tag) return null;
  try {
    return decryptSecret({ ciphertext, iv, tag });
  } catch {
    return null;
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
