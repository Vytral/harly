import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

export type ZoomConfig = {
  configured: boolean;
  installationState: "not_installed" | "installed";
  credentialsSource: "env" | "database";
  accountEmail: string | null;
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

/**
 * Resolve a usable Zoom config (with decrypted token) for a workspace,
 * or null when disabled / unconfigured.
 */
export async function getZoomToken(workspaceId: string): Promise<string | null> {
  if (!isEncryptionConfigured()) return null;

  const [row] = await db
    .select({
      zoomTokenCiphertext: workspaceSettings.zoomTokenCiphertext,
      zoomTokenIv: workspaceSettings.zoomTokenIv,
      zoomTokenTag: workspaceSettings.zoomTokenTag,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    !row?.zoomTokenCiphertext ||
    !row?.zoomTokenIv ||
    !row?.zoomTokenTag
  ) {
    return null;
  }

  try {
    return decryptSecret({
      ciphertext: row.zoomTokenCiphertext,
      iv: row.zoomTokenIv,
      tag: row.zoomTokenTag,
    });
  } catch {
    return null;
  }
}
