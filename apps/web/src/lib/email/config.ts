import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";
import type { EmailProviderConfig, InboundProviderId } from "@harly/emails";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

export type EmailProviderId = "resend" | "smtp";

export function isEmailProviderId(value: string): value is EmailProviderId {
  return value === "resend" || value === "smtp";
}

function isInboundProviderId(value: string): value is InboundProviderId {
  return value === "resend" || value === "postmark";
}

export type WorkspaceEmailStatus = {
  enabled: boolean;
  provider: EmailProviderId | null;
  from: string | null;
  /** True only when a key/password is stored (never the secret itself). */
  hasSecret: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  /** False when AI_ENCRYPTION_KEY is missing/invalid — secrets can't be stored. */
  encryptionReady: boolean;
  /** True when this workspace has no config but the platform RESEND_API_KEY is set. */
  usingPlatformDefault: boolean;
};

/** Public-safe email status for the settings UI. Never returns secrets. */
export async function getWorkspaceEmailStatus(
  workspaceId: string,
): Promise<WorkspaceEmailStatus> {
  const [row] = await db
    .select({
      emailEnabled: workspaceSettings.emailEnabled,
      emailProvider: workspaceSettings.emailProvider,
      emailFrom: workspaceSettings.emailFrom,
      emailApiKeyCiphertext: workspaceSettings.emailApiKeyCiphertext,
      emailSmtpHost: workspaceSettings.emailSmtpHost,
      emailSmtpPort: workspaceSettings.emailSmtpPort,
      emailSmtpSecure: workspaceSettings.emailSmtpSecure,
      emailSmtpUser: workspaceSettings.emailSmtpUser,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  const provider =
    row?.emailProvider && isEmailProviderId(row.emailProvider)
      ? row.emailProvider
      : null;

  return {
    enabled: Boolean(row?.emailEnabled),
    provider,
    from: row?.emailFrom ?? null,
    hasSecret: Boolean(row?.emailApiKeyCiphertext),
    smtpHost: row?.emailSmtpHost ?? null,
    smtpPort: row?.emailSmtpPort ?? null,
    smtpSecure: Boolean(row?.emailSmtpSecure),
    smtpUser: row?.emailSmtpUser ?? null,
    encryptionReady: isEncryptionConfigured(),
    usingPlatformDefault: !row?.emailEnabled && Boolean(process.env.RESEND_API_KEY),
  };
}

/**
 * Resolve a usable email provider config (with decrypted secret) for a
 * workspace, or null when email is disabled / unconfigured / the master key
 * is missing. Callers should fall back to the platform env-based sender.
 */
export async function getWorkspaceEmailConfig(
  workspaceId: string,
): Promise<EmailProviderConfig | null> {
  if (!isEncryptionConfigured()) {
    return null;
  }

  const [row] = await db
    .select({
      emailEnabled: workspaceSettings.emailEnabled,
      emailProvider: workspaceSettings.emailProvider,
      emailFrom: workspaceSettings.emailFrom,
      emailApiKeyCiphertext: workspaceSettings.emailApiKeyCiphertext,
      emailApiKeyIv: workspaceSettings.emailApiKeyIv,
      emailApiKeyTag: workspaceSettings.emailApiKeyTag,
      emailSmtpHost: workspaceSettings.emailSmtpHost,
      emailSmtpPort: workspaceSettings.emailSmtpPort,
      emailSmtpSecure: workspaceSettings.emailSmtpSecure,
      emailSmtpUser: workspaceSettings.emailSmtpUser,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    !row ||
    !row.emailEnabled ||
    !row.emailProvider ||
    !isEmailProviderId(row.emailProvider) ||
    !row.emailFrom
  ) {
    return null;
  }

  if (row.emailProvider === "resend") {
    if (!row.emailApiKeyCiphertext || !row.emailApiKeyIv || !row.emailApiKeyTag) {
      return null;
    }

    try {
      const apiKey = decryptSecret({
        ciphertext: row.emailApiKeyCiphertext,
        iv: row.emailApiKeyIv,
        tag: row.emailApiKeyTag,
      });

      return { provider: "resend", apiKey, from: row.emailFrom };
    } catch {
      return null;
    }
  }

  if (!row.emailSmtpHost || !row.emailSmtpPort) {
    return null;
  }

  let pass: string | undefined;
  if (row.emailApiKeyCiphertext && row.emailApiKeyIv && row.emailApiKeyTag) {
    try {
      pass = decryptSecret({
        ciphertext: row.emailApiKeyCiphertext,
        iv: row.emailApiKeyIv,
        tag: row.emailApiKeyTag,
      });
    } catch {
      return null;
    }
  }

  return {
    provider: "smtp",
    from: row.emailFrom,
    host: row.emailSmtpHost,
    port: row.emailSmtpPort,
    secure: Boolean(row.emailSmtpSecure),
    user: row.emailSmtpUser ?? undefined,
    pass,
  };
}

export type WorkspaceInboundEmailStatus = {
  enabled: boolean;
  provider: InboundProviderId | null;
  replyDomain: string | null;
  /** True only when a webhook secret is stored (never the secret itself). */
  hasWebhookSecret: boolean;
  /** Resend only — true when an inbound-specific API key is stored. */
  hasResendApiKey: boolean;
  encryptionReady: boolean;
};

/** Public-safe inbound email status for the settings UI. Never returns secrets. */
export async function getWorkspaceInboundEmailStatus(
  workspaceId: string,
): Promise<WorkspaceInboundEmailStatus> {
  const [row] = await db
    .select({
      emailInboundEnabled: workspaceSettings.emailInboundEnabled,
      emailInboundProvider: workspaceSettings.emailInboundProvider,
      emailInboundReplyDomain: workspaceSettings.emailInboundReplyDomain,
      emailInboundWebhookSecret: workspaceSettings.emailInboundWebhookSecret,
      emailInboundResendApiKeyCiphertext:
        workspaceSettings.emailInboundResendApiKeyCiphertext,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  const provider =
    row?.emailInboundProvider && isInboundProviderId(row.emailInboundProvider)
      ? row.emailInboundProvider
      : null;

  return {
    enabled: Boolean(row?.emailInboundEnabled),
    provider,
    replyDomain: row?.emailInboundReplyDomain ?? null,
    hasWebhookSecret: Boolean(row?.emailInboundWebhookSecret),
    hasResendApiKey: Boolean(row?.emailInboundResendApiKeyCiphertext),
    encryptionReady: isEncryptionConfigured(),
  };
}

export type WorkspaceInboundEmailConfig = {
  provider: InboundProviderId;
  webhookSecret: string;
  /** Only present for the "resend" provider. */
  resendApiKey?: string;
};

/**
 * Resolve a usable inbound email config (with decrypted secrets) for a
 * workspace, or null when inbound is disabled / unconfigured / the master
 * key is missing.
 */
export async function getWorkspaceInboundEmailConfig(
  workspaceId: string,
): Promise<WorkspaceInboundEmailConfig | null> {
  const [row] = await db
    .select({
      emailInboundEnabled: workspaceSettings.emailInboundEnabled,
      emailInboundProvider: workspaceSettings.emailInboundProvider,
      emailInboundWebhookSecret: workspaceSettings.emailInboundWebhookSecret,
      emailInboundResendApiKeyCiphertext:
        workspaceSettings.emailInboundResendApiKeyCiphertext,
      emailInboundResendApiKeyIv: workspaceSettings.emailInboundResendApiKeyIv,
      emailInboundResendApiKeyTag: workspaceSettings.emailInboundResendApiKeyTag,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    !row ||
    !row.emailInboundEnabled ||
    !row.emailInboundProvider ||
    !isInboundProviderId(row.emailInboundProvider) ||
    !row.emailInboundWebhookSecret
  ) {
    return null;
  }

  if (row.emailInboundProvider === "resend") {
    if (
      !isEncryptionConfigured() ||
      !row.emailInboundResendApiKeyCiphertext ||
      !row.emailInboundResendApiKeyIv ||
      !row.emailInboundResendApiKeyTag
    ) {
      return null;
    }

    try {
      const resendApiKey = decryptSecret({
        ciphertext: row.emailInboundResendApiKeyCiphertext,
        iv: row.emailInboundResendApiKeyIv,
        tag: row.emailInboundResendApiKeyTag,
      });

      return {
        provider: "resend",
        webhookSecret: row.emailInboundWebhookSecret,
        resendApiKey,
      };
    } catch {
      return null;
    }
  }

  return { provider: "postmark", webhookSecret: row.emailInboundWebhookSecret };
}
