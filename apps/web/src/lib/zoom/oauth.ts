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

import { getZoomCredentials } from "./config";

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

async function performZoomRefresh(workspaceId: string): Promise<ZoomRefreshResult> {
  const credentials = await getZoomCredentials(workspaceId);
  if (!credentials) {
    return { ok: false, reason: "no_credentials", error: "Zoom credentials are not configured." };
  }

  const refreshToken = await readStoredRefreshToken(workspaceId);
  if (!refreshToken) {
    const error = "Zoom refresh token is missing. Reconnect Zoom.";
    await recordIntegrationFailure(workspaceId, "zoom", error, { kind: "auth" });
    return { ok: false, reason: "no_refresh_token", error };
  }

  let response: Response;
  let body: ZoomTokenResponse | null;
  try {
    response = await fetch(ZOOM_TOKEN_URL, {
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
    body = (await response.json().catch(() => null)) as ZoomTokenResponse | null;
  } catch (error) {
    return failRefresh(workspaceId, error);
  }

  if (!response.ok || !body?.access_token) {
    const detail = body?.error ?? body?.reason ?? "unknown";
    return failRefresh(
      workspaceId,
      Object.assign(
        new Error(`Zoom token refresh failed (${response.status}): ${detail}`),
        { status: response.status },
      ),
    );
  }

  const nextRefreshToken = body.refresh_token ?? refreshToken;
  try {
    await persistZoomTokens(workspaceId, body.access_token, nextRefreshToken);
  } catch (error) {
    // The rotated pair is already issued; without persisting it the
    // connection cannot refresh again, so surface it as a failure.
    log.error({ err: error }, "Failed to persist rotated Zoom tokens");
    return failRefresh(workspaceId, error);
  }

  await recordIntegrationSuccess(workspaceId, "zoom");
  return { ok: true, accessToken: body.access_token };
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

async function readStoredRefreshToken(workspaceId: string): Promise<string | null> {
  if (!isEncryptionConfigured()) return null;
  const [row] = await db
    .select({
      ciphertext: workspaceSettings.zoomRefreshTokenCiphertext,
      iv: workspaceSettings.zoomRefreshTokenIv,
      tag: workspaceSettings.zoomRefreshTokenTag,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  if (!row?.ciphertext || !row.iv || !row.tag) return null;
  try {
    return decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag });
  } catch {
    return null;
  }
}

async function persistZoomTokens(
  workspaceId: string,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const encryptedAccess = encryptSecret(accessToken);
  const encryptedRefresh = encryptSecret(refreshToken);
  await db
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
