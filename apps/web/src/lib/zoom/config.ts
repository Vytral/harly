import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import {
  CREDENTIALS_UNREADABLE_MESSAGE,
  buildIntegrationHealthView,
} from "@/features/integrations/health/model";
import {
  getIntegrationHealth,
  recordIntegrationFailure,
} from "@/features/integrations/health/repository";
import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

export type ZoomConfig = {
  configured: boolean;
  installationState: "not_installed" | "installed";
  credentialsSource: "env" | "database";
  accountEmail: string | null;
  encryptionReady: boolean;
};

export type ZoomCredentials = {
  clientId: string;
  clientSecret: string;
};

/** Public-safe status for the settings UI. Never returns secrets. */
export async function getZoomConfig(workspaceId: string): Promise<ZoomConfig> {
  const [row] = await db
    .select({
      zoomClientId: workspaceSettings.zoomClientId,
      zoomClientSecretCiphertext: workspaceSettings.zoomClientSecretCiphertext,
      zoomEnabled: workspaceSettings.zoomEnabled,
      zoomAccountId: workspaceSettings.zoomAccountId,
      zoomAccountEmail: workspaceSettings.zoomAccountEmail,
      zoomTokenCiphertext: workspaceSettings.zoomTokenCiphertext,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  const hasDbCredentials = Boolean(
    row?.zoomClientId && row?.zoomClientSecretCiphertext,
  );
  const hasEnvCredentials = Boolean(
    process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET,
  );

  return {
    configured: hasDbCredentials || hasEnvCredentials,
    installationState: row?.zoomEnabled ? "installed" : "not_installed",
    credentialsSource: hasEnvCredentials ? "env" : "database",
    accountEmail: row?.zoomAccountEmail ?? null,
    encryptionReady: isEncryptionConfigured(),
  };
}

/**
 * Resolve OAuth credentials for a workspace. Priority: DB (per-workspace) > env (global).
 */
export async function getZoomCredentials(
  workspaceId: string,
): Promise<ZoomCredentials | null> {
  const [row] = await db
    .select({
      zoomClientId: workspaceSettings.zoomClientId,
      zoomClientSecretCiphertext: workspaceSettings.zoomClientSecretCiphertext,
      zoomClientSecretIv: workspaceSettings.zoomClientSecretIv,
      zoomClientSecretTag: workspaceSettings.zoomClientSecretTag,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    row?.zoomClientId &&
    row?.zoomClientSecretCiphertext &&
    row?.zoomClientSecretIv &&
    row?.zoomClientSecretTag
  ) {
    try {
      const clientSecret = decryptSecret({
        ciphertext: row.zoomClientSecretCiphertext,
        iv: row.zoomClientSecretIv,
        tag: row.zoomClientSecretTag,
      });
      return { clientId: row.zoomClientId, clientSecret };
    } catch {
      // Fall through to env
    }
  }

  if (process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET) {
    return {
      clientId: process.env.ZOOM_CLIENT_ID,
      clientSecret: process.env.ZOOM_CLIENT_SECRET,
    };
  }

  return null;
}

export type ZoomAccessTokenState =
  | { status: "ready"; token: string }
  | { status: "not_connected" }
  | { status: "unreadable" };

/**
 * The stored access token, or why there is none. A stored token that cannot be
 * decrypted is recorded as an error with the encryption reason, never as a
 * dead login or a plain "not installed".
 */
export async function getZoomTokenState(workspaceId: string): Promise<ZoomAccessTokenState> {
  const [row] = await db
    .select({
      zoomTokenCiphertext: workspaceSettings.zoomTokenCiphertext,
      zoomTokenIv: workspaceSettings.zoomTokenIv,
      zoomTokenTag: workspaceSettings.zoomTokenTag,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (!row?.zoomTokenCiphertext) return { status: "not_connected" };

  if (row.zoomTokenIv && row.zoomTokenTag && isEncryptionConfigured()) {
    try {
      return {
        status: "ready",
        token: decryptSecret({
          ciphertext: row.zoomTokenCiphertext,
          iv: row.zoomTokenIv,
          tag: row.zoomTokenTag,
        }),
      };
    } catch {
      // Falls through to the unreadable result below.
    }
  }

  await recordIntegrationFailure(workspaceId, "zoom", CREDENTIALS_UNREADABLE_MESSAGE, {
    kind: "other",
    forceState: "error",
  });
  return { status: "unreadable" };
}

/**
 * A Zoom access token that may be used to pick a meeting provider. Null when
 * Zoom is not connected, the token cannot be read, or Zoom needs reconnecting
 * (the stored token is still there, but Zoom has rejected its refresh token).
 * Use `getZoomTokenState` to tell those apart.
 */
export async function getZoomToken(workspaceId: string): Promise<string | null> {
  const state = await getZoomTokenState(workspaceId);
  if (state.status !== "ready") return null;
  const stored = (await getIntegrationHealth(workspaceId)).zoom ?? null;
  return buildIntegrationHealthView("zoom", true, stored).connected ? state.token : null;
}
