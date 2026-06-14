import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";
import type { EmailProviderConfig } from "@harly/emails";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

export type EmailProviderId = "resend" | "smtp";

export function isEmailProviderId(value: string): value is EmailProviderId {
  return value === "resend" || value === "smtp";
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
