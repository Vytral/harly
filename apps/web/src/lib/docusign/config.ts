import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

/**
 * Default DocuSign OAuth + REST base host. Demo (sandbox) is account-d; prod is
 * account. A workspace pins its own resolved base URL on callback (from
 * getUserInfo), but the install flow starts against this host.
 */
export const DEFAULT_DOCUSIGN_BASE_URL =
  process.env.DOCUSIGN_BASE_URL ?? "https://account-d.docusign.com";

/** Accept only the regional HTTPS REST hosts returned by DocuSign getUserInfo. */
export function normalizeDocuSignRestBaseUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !/(^|\.)docusign\.net$/i.test(url.hostname)
    ) {
      return null;
    }
    return `${url.origin}/restapi`;
  } catch {
    return null;
  }
}

function inferDocuSignAuthBaseUrl(restBaseUrl: string | null | undefined) {
  if (restBaseUrl?.includes("demo.docusign.net")) {
    return "https://account-d.docusign.com";
  }
  if (restBaseUrl?.includes("docusign.net")) {
    return "https://account.docusign.com";
  }
  return DEFAULT_DOCUSIGN_BASE_URL;
}
export type WorkspaceDocuSignStatus = {
  enabled: boolean;
  accountEmail: string | null;
  hasToken: boolean;
  hasCredentials: boolean;
  accountId: string | null;
  baseUrl: string | null;
  hasConnectSecret: boolean;
  offerSignatureChannel: "email" | "docusign";
  encryptionReady: boolean;
};

export type DocuSignCredentials = {
  clientId: string;
  clientSecret: string;
  /** OAuth authorization server base URL (https://account-d.docusign.com or prod). */
  authBaseUrl: string;
};

export type DocuSignConfig = {
  accessToken: string;
  accessTokenExpiresAt: Date | null;
  refreshToken: string;
  accountId: string;
  /** REST API base URL, e.g. https://eu.docusign.net/restapi (from getUserInfo). */
  baseUrl: string;
  offerSignatureChannel: "email" | "docusign";
  connectSecret: string | null;
};

/**
 * Public-safe status for the settings UI. Never returns secrets.
 */
export async function getWorkspaceDocuSignStatus(
  workspaceId: string,
): Promise<WorkspaceDocuSignStatus> {
  const [row] = await db
    .select({
      docusignEnabled: workspaceSettings.docusignEnabled,
      docusignAccountEmail: workspaceSettings.docusignAccountEmail,
      docusignAccessTokenCiphertext:
        workspaceSettings.docusignAccessTokenCiphertext,
      docusignClientId: workspaceSettings.docusignClientId,
      docusignClientSecretCiphertext:
        workspaceSettings.docusignClientSecretCiphertext,
      docusignAccountId: workspaceSettings.docusignAccountId,
      docusignBaseUrl: workspaceSettings.docusignBaseUrl,
      docusignConnectSecret: workspaceSettings.docusignConnectSecret,
      offerSignatureChannel: workspaceSettings.offerSignatureChannel,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  const hasDbCredentials = Boolean(
    row?.docusignClientId && row?.docusignClientSecretCiphertext,
  );
  const hasEnvCredentials = Boolean(
    process.env.DOCUSIGN_CLIENT_ID && process.env.DOCUSIGN_CLIENT_SECRET,
  );

  // offerSignatureChannel defaults to "email" at the DB level; coerce null.
  const channel = row?.offerSignatureChannel ?? "email";

  return {
    enabled: Boolean(row?.docusignEnabled),
    accountEmail: row?.docusignAccountEmail ?? null,
    hasToken: Boolean(row?.docusignAccessTokenCiphertext),
    hasCredentials: hasDbCredentials || hasEnvCredentials,
    accountId: row?.docusignAccountId ?? null,
    baseUrl: row?.docusignBaseUrl ?? null,
    hasConnectSecret: Boolean(row?.docusignConnectSecret),
    offerSignatureChannel: channel === "docusign" ? "docusign" : "email",
    encryptionReady: isEncryptionConfigured(),
  };
}

/**
 * Resolve OAuth credentials for a workspace. Priority: DB (per-workspace) > env
 * (global). Returns null if neither is configured.
 */
export async function getWorkspaceDocuSignCredentials(
  workspaceId: string,
): Promise<DocuSignCredentials | null> {
  const [row] = await db
    .select({
      docusignClientId: workspaceSettings.docusignClientId,
      docusignClientSecretCiphertext:
        workspaceSettings.docusignClientSecretCiphertext,
      docusignClientSecretIv: workspaceSettings.docusignClientSecretIv,
      docusignClientSecretTag: workspaceSettings.docusignClientSecretTag,
      docusignAuthBaseUrl: workspaceSettings.docusignAuthBaseUrl,
      docusignBaseUrl: workspaceSettings.docusignBaseUrl,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  // Try workspace-level credentials first.
  if (
    row?.docusignClientId &&
    row?.docusignClientSecretCiphertext &&
    row?.docusignClientSecretIv &&
    row?.docusignClientSecretTag
  ) {
    try {
      const clientSecret = decryptSecret({
        ciphertext: row.docusignClientSecretCiphertext,
        iv: row.docusignClientSecretIv,
        tag: row.docusignClientSecretTag,
      });
      return {
        clientId: row.docusignClientId,
        clientSecret,
        // OAuth authorization host is separate from the regional REST base URL.
        authBaseUrl: row.docusignAuthBaseUrl ?? inferDocuSignAuthBaseUrl(row.docusignBaseUrl),
      };
    } catch {
      // Fall through to env.
    }
  }

  // Fallback: global env vars (self-hosted single-tenant).
  if (process.env.DOCUSIGN_CLIENT_ID && process.env.DOCUSIGN_CLIENT_SECRET) {
    return {
      clientId: process.env.DOCUSIGN_CLIENT_ID,
      clientSecret: process.env.DOCUSIGN_CLIENT_SECRET,
      authBaseUrl: DEFAULT_DOCUSIGN_BASE_URL,
    };
  }

  return null;
}

/**
 * Resolve a usable DocuSign config (with decrypted tokens) for a workspace, or
 * null when disabled / unconfigured.
 */
export async function getWorkspaceDocuSignConfig(
  workspaceId: string,
): Promise<DocuSignConfig | null> {
  if (!isEncryptionConfigured()) return null;

  const [row] = await db
    .select({
      docusignEnabled: workspaceSettings.docusignEnabled,
      docusignAccessTokenCiphertext:
        workspaceSettings.docusignAccessTokenCiphertext,
      docusignAccessTokenIv: workspaceSettings.docusignAccessTokenIv,
      docusignAccessTokenTag: workspaceSettings.docusignAccessTokenTag,
      docusignAccessTokenExpiresAt:
        workspaceSettings.docusignAccessTokenExpiresAt,
      docusignRefreshTokenCiphertext:
        workspaceSettings.docusignRefreshTokenCiphertext,
      docusignRefreshTokenIv: workspaceSettings.docusignRefreshTokenIv,
      docusignRefreshTokenTag: workspaceSettings.docusignRefreshTokenTag,
      docusignAccountId: workspaceSettings.docusignAccountId,
      docusignBaseUrl: workspaceSettings.docusignBaseUrl,
      offerSignatureChannel: workspaceSettings.offerSignatureChannel,
      docusignConnectSecret: workspaceSettings.docusignConnectSecret,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    !row ||
    !row.docusignEnabled ||
    !row.docusignAccessTokenCiphertext ||
    !row.docusignAccessTokenIv ||
    !row.docusignAccessTokenTag ||
    !row.docusignRefreshTokenCiphertext ||
    !row.docusignRefreshTokenIv ||
    !row.docusignRefreshTokenTag ||
    !row.docusignAccountId ||
    !row.docusignBaseUrl
  ) {
    return null;
  }

  const baseUrl = normalizeDocuSignRestBaseUrl(row.docusignBaseUrl);
  if (!baseUrl) return null;

  try {
    const accessToken = decryptSecret({
      ciphertext: row.docusignAccessTokenCiphertext,
      iv: row.docusignAccessTokenIv,
      tag: row.docusignAccessTokenTag,
    });

    const refreshToken = decryptSecret({
      ciphertext: row.docusignRefreshTokenCiphertext,
      iv: row.docusignRefreshTokenIv,
      tag: row.docusignRefreshTokenTag,
    });

    const channel = row.offerSignatureChannel ?? "email";

    return {
      accessToken,
      accessTokenExpiresAt: row.docusignAccessTokenExpiresAt ?? null,
      refreshToken,
      accountId: row.docusignAccountId,
      baseUrl,
      offerSignatureChannel: channel === "docusign" ? "docusign" : "email",
      connectSecret: row.docusignConnectSecret ?? null,
    };
  } catch {
    return null;
  }
}
