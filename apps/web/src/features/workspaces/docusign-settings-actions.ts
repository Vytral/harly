"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import {
  getWorkspaceDocuSignConfig,
  getWorkspaceDocuSignCredentials,
  getWorkspaceDocuSignStatus,
  type WorkspaceDocuSignStatus,
} from "@/lib/docusign/config";
import {
  getDocuSignUserInfo,
  refreshDocuSignToken,
} from "@/lib/docusign/client";

const log = createLogger("workspace-docusign-settings");

export type DocuSignActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/integrations";

const RECONNECT_MESSAGE =
  "DocuSign revoked this connection. Disconnect and reconnect DocuSign.";

/** True when DocuSign rejected the stored refresh token (revoked/expired). */
function isInvalidGrant(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("invalid_grant");
}

/** Wipe the dead tokens so status flips back to "not connected". */
async function clearDocusignToken(organizationId: string): Promise<void> {
  await db
    .update(workspaceSettings)
    .set({
      docusignEnabled: false,
      docusignAccessTokenCiphertext: null,
      docusignAccessTokenIv: null,
      docusignAccessTokenTag: null,
      docusignAccessTokenExpiresAt: null,
      docusignRefreshTokenCiphertext: null,
      docusignRefreshTokenIv: null,
      docusignRefreshTokenTag: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, organizationId));
  revalidatePath(SETTINGS_PATH);
}

/**
 * DocuSign access tokens live ~8h. Exchange the stored refresh token for a
 * fresh access token (refreshDocuSignToken persists the rotated pair). Throws
 * on a dead refresh token so callers can clear + prompt a reconnect.
 */
async function freshDocuSignAccessToken(
  workspaceId: string,
): Promise<string | null> {
  const config = await getWorkspaceDocuSignConfig(workspaceId);
  if (!config) return null;
  const credentials = await getWorkspaceDocuSignCredentials(workspaceId);
  if (!credentials) return null;

  return refreshDocuSignToken({
    workspaceId,
    authBaseUrl: credentials.authBaseUrl,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: config.refreshToken,
  });
}

/** Save DocuSign App credentials (Integration Key + Secret) for this workspace. */
export async function saveDocusignCredentialsAction(input: {
  clientId: string;
  clientSecret: string;
}): Promise<DocuSignActionResult> {
  const context = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return { ok: false, error: "Server encryption key not configured." };
  }

  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: "Both Integration Key and Secret are required.",
    };
  }

  const encrypted = encryptSecret(clientSecret);

  const set: Partial<typeof workspaceSettings.$inferInsert> = {
    docusignClientId: clientId,
    docusignClientSecretCiphertext: encrypted.ciphertext,
    docusignClientSecretIv: encrypted.iv,
    docusignClientSecretTag: encrypted.tag,
    updatedAt: new Date(),
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, ...set })
    .onConflictDoUpdate({ target: workspaceSettings.organizationId, set });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Save one or more active DocuSign Connect HMAC secrets for rotation. */
export async function saveDocusignConnectSecretAction(input: {
  connectSecret: string;
}): Promise<DocuSignActionResult> {
  const context = await requirePermission("integrations:manage");
  if (typeof input.connectSecret !== "string") {
    return { ok: false, error: "Enter a valid DocuSign Connect HMAC key." };
  }
  const secrets = input.connectSecret
    .split(",")
    .map((secret) => secret.trim())
    .filter(Boolean);
  if (secrets.length === 0 || secrets.some((secret) => secret.length < 16)) {
    return {
      ok: false,
      error: "Enter a valid DocuSign Connect HMAC key (16+ characters).",
    };
  }
  if (secrets.length > 3 || secrets.join(",").length > 2048) {
    return { ok: false, error: "You can keep up to three HMAC keys during rotation." };
  }
  await db
    .update(workspaceSettings)
    .set({ docusignConnectSecret: secrets.join(","), updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Toggle the per-workspace offer delivery channel (email | docusign). */
export async function saveOfferSignatureChannelAction(
  channel: "email" | "docusign",
): Promise<DocuSignActionResult> {
  const context = await requirePermission("integrations:manage");

  const status = await getWorkspaceDocuSignStatus(context.organization.id);
  if (channel === "docusign" && (!status.hasToken || !status.hasConnectSecret)) {
    return {
      ok: false,
      error: "Connect DocuSign and save its Connect HMAC key before using it for offer signatures.",
    };
  }

  await db
    .update(workspaceSettings)
    .set({ offerSignatureChannel: channel, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Disconnect DocuSign: clear all docusign token columns + reset channel. */
export async function disconnectDocusignAction(): Promise<DocuSignActionResult> {
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({
      docusignEnabled: false,
      docusignAccountEmail: null,
      docusignAccountId: null,
      docusignAuthBaseUrl: null,
      docusignBaseUrl: null,
      docusignAccessTokenCiphertext: null,
      docusignAccessTokenIv: null,
      docusignAccessTokenTag: null,
      docusignAccessTokenExpiresAt: null,
      docusignRefreshTokenCiphertext: null,
      docusignRefreshTokenIv: null,
      docusignRefreshTokenTag: null,
      docusignConnectSecret: null,
      offerSignatureChannel: "email",
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Verify the connection by refreshing the token + calling getUserInfo. */
export async function testDocusignAction(): Promise<DocuSignActionResult> {
  const context = await requirePermission("integrations:manage");
  const config = await getWorkspaceDocuSignConfig(context.organization.id);
  if (!config) return { ok: false, error: "DocuSign not connected." };

  const credentials = await getWorkspaceDocuSignCredentials(
    context.organization.id,
  );
  if (!credentials) return { ok: false, error: "DocuSign not connected." };

  try {
    const accessToken = await freshDocuSignAccessToken(context.organization.id);
    if (!accessToken) return { ok: false, error: "DocuSign not connected." };
    await getDocuSignUserInfo(accessToken, credentials.authBaseUrl);
    return { ok: true };
  } catch (err) {
    log.error(err, "testDocusignAction failed");
    if (isInvalidGrant(err)) {
      await clearDocusignToken(context.organization.id);
      return { ok: false, error: RECONNECT_MESSAGE };
    }
    const msg = err instanceof Error ? err.message : "Connection test failed.";
    return { ok: false, error: msg };
  }
}

export type { WorkspaceDocuSignStatus };
