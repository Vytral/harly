import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

/**
 * DocuSeal (self-hosted e-signature) per-workspace config. Unlike DocuSign there
 * is no OAuth: a base instance URL plus a static API token (sent as X-Auth-Token,
 * encrypted at rest) is the whole credential. The webhook secret is a plaintext
 * shared token accepted only from an inbound header and checked server-side.
 */

/** Public-safe status for the settings UI. Never returns the token. */
export type WorkspaceEsignStatus = {
  enabled: boolean;
  /** Base instance URL, e.g. https://sign.example.com (no trailing /api). */
  url: string | null;
  /** Raw configured URL retained so unsafe legacy values cannot bypass rotation checks. */
  configuredUrl: string | null;
  hasToken: boolean;
  hasWebhookSecret: boolean;
  /**
   * The webhook shared secret. It must be configured as an inbound webhook
   * header (or used by an HMAC-capable proxy); it is not a URL credential.
   * Null until the integration is first saved.
   */
  webhookSecret: string | null;
  offerSignatureChannel: "email" | "esign" | "native";
  encryptionReady: boolean;
};

/** Resolved config with the decrypted token, for server-to-server REST calls. */
export type EsignConfig = {
  /** Normalized base URL WITHOUT a trailing slash and WITHOUT /api. */
  baseUrl: string;
  /** REST API base, i.e. `${baseUrl}/api`. */
  apiUrl: string;
  apiToken: string;
  webhookSecret: string | null;
  offerSignatureChannel: "email" | "esign" | "native";
};

function resolveOfferSignatureChannel(value: string | null | undefined): "email" | "esign" | "native" {
  return value === "esign" || value === "native" ? value : "email";
}

/** Strip a trailing slash and a trailing /api so we can derive both cleanly. */
function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    const path = url.pathname.replace(/\/?api\/?$/i, "").replace(/\/$/, "");
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

/** Global env fallback for single-tenant self-hosts. */
function envToken(): string | null {
  return process.env.DOCUSEAL_API_TOKEN?.trim() || null;
}
function envUrl(): string | null {
  return normalizeBaseUrl(process.env.DOCUSEAL_URL);
}

export async function getWorkspaceEsignStatus(
  workspaceId: string,
): Promise<WorkspaceEsignStatus> {
  const [row] = await db
    .select({
      docusealEnabled: workspaceSettings.docusealEnabled,
      docusealUrl: workspaceSettings.docusealUrl,
      docusealApiTokenCiphertext: workspaceSettings.docusealApiTokenCiphertext,
      docusealWebhookSecret: workspaceSettings.docusealWebhookSecret,
      offerSignatureChannel: workspaceSettings.offerSignatureChannel,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  const channel = resolveOfferSignatureChannel(row?.offerSignatureChannel);
  const url = normalizeBaseUrl(row?.docusealUrl) ?? envUrl();
  const configuredUrl = row?.docusealUrl?.trim() || envUrl();

  return {
    enabled: Boolean(row?.docusealEnabled),
    url,
    configuredUrl,
    hasToken: Boolean(row?.docusealApiTokenCiphertext) || Boolean(envToken()),
    hasWebhookSecret: Boolean(row?.docusealWebhookSecret),
    webhookSecret: row?.docusealWebhookSecret ?? null,
    offerSignatureChannel: channel,
    encryptionReady: isEncryptionConfigured(),
  };
}

/**
 * Resolve a usable config (decrypted token) for a workspace, or null when the
 * integration is disabled / unconfigured. Priority: per-workspace DB row > env.
 */
export async function getWorkspaceEsignConfig(
  workspaceId: string,
): Promise<EsignConfig | null> {
  const [row] = await db
    .select({
      docusealEnabled: workspaceSettings.docusealEnabled,
      docusealUrl: workspaceSettings.docusealUrl,
      docusealApiTokenCiphertext: workspaceSettings.docusealApiTokenCiphertext,
      docusealApiTokenIv: workspaceSettings.docusealApiTokenIv,
      docusealApiTokenTag: workspaceSettings.docusealApiTokenTag,
      docusealWebhookSecret: workspaceSettings.docusealWebhookSecret,
      offerSignatureChannel: workspaceSettings.offerSignatureChannel,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (!row?.docusealEnabled) return null;

  const baseUrl = normalizeBaseUrl(row.docusealUrl) ?? envUrl();
  if (!baseUrl) return null;

  let apiToken: string | null = null;
  if (
    isEncryptionConfigured() &&
    row.docusealApiTokenCiphertext &&
    row.docusealApiTokenIv &&
    row.docusealApiTokenTag
  ) {
    try {
      apiToken = decryptSecret({
        ciphertext: row.docusealApiTokenCiphertext,
        iv: row.docusealApiTokenIv,
        tag: row.docusealApiTokenTag,
      });
    } catch {
      apiToken = null;
    }
  }
  apiToken = apiToken ?? envToken();
  if (!apiToken) return null;

  const channel = resolveOfferSignatureChannel(row.offerSignatureChannel);

  return {
    baseUrl,
    apiUrl: `${baseUrl}/api`,
    apiToken,
    webhookSecret: row.docusealWebhookSecret ?? null,
    offerSignatureChannel: channel,
  };
}
