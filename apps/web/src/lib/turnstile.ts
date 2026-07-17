import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

const VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type WorkspaceTurnstileStatus = {
  enabled: boolean;
  /** Public site key (safe to expose to the client). */
  siteKey: string | null;
  /** True only when a secret key is stored (never the secret itself). */
  hasSecretKey: boolean;
  /** False when AI_ENCRYPTION_KEY is missing/invalid , secret can't be stored. */
  encryptionReady: boolean;
};

/** Public-safe Turnstile status for the settings UI. Never returns the secret. */
export async function getWorkspaceTurnstileStatus(
  workspaceId: string,
): Promise<WorkspaceTurnstileStatus> {
  const [row] = await db
    .select({
      turnstileEnabled: workspaceSettings.turnstileEnabled,
      turnstileSiteKey: workspaceSettings.turnstileSiteKey,
      turnstileSecretCiphertext: workspaceSettings.turnstileSecretCiphertext,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  return {
    enabled: Boolean(row?.turnstileEnabled),
    siteKey: row?.turnstileSiteKey ?? null,
    hasSecretKey: Boolean(row?.turnstileSecretCiphertext),
    encryptionReady: isEncryptionConfigured(),
  };
}

/**
 * Resolve the site key to render on the public application form. Prefers the
 * workspace's own key (when Turnstile is enabled), falling back to the global
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY env var. Returns null when neither is set ,
 * the widget then renders nothing and verification is skipped.
 */
export async function resolveTurnstileSiteKey(
  workspaceId: string,
): Promise<string | null> {
  const status = await getWorkspaceTurnstileStatus(workspaceId);
  if (status.enabled && status.siteKey) {
    return status.siteKey;
  }
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;
}

/**
 * Resolve the secret to verify a token against. Workspace secret (decrypted)
 * wins when Turnstile is enabled for the org; otherwise the TURNSTILE_SECRET_KEY
 * env var. Returns null when neither is configured → verification is skipped.
 */
async function resolveTurnstileSecret(
  workspaceId: string,
): Promise<string | null> {
  if (isEncryptionConfigured()) {
    const [row] = await db
      .select({
        turnstileEnabled: workspaceSettings.turnstileEnabled,
        turnstileSecretCiphertext: workspaceSettings.turnstileSecretCiphertext,
        turnstileSecretIv: workspaceSettings.turnstileSecretIv,
        turnstileSecretTag: workspaceSettings.turnstileSecretTag,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1);

    if (
      row?.turnstileEnabled &&
      row.turnstileSecretCiphertext &&
      row.turnstileSecretIv &&
      row.turnstileSecretTag
    ) {
      try {
        return decryptSecret({
          ciphertext: row.turnstileSecretCiphertext,
          iv: row.turnstileSecretIv,
          tag: row.turnstileSecretTag,
        });
      } catch {
        // Fall through to env on a decryption failure.
      }
    }
  }

  return process.env.TURNSTILE_SECRET_KEY ?? null;
}

/**
 * Verify a Turnstile token for a workspace's application form.
 *
 * When no secret is configured (neither org nor env), verification is skipped
 * (returns true) so self-hosters without Turnstile aren't blocked.
 *
 * When `enforced` (default true) and a global TURNSTILE_SECRET_KEY is set,
 * verification is REQUIRED regardless of the per-workspace toggle , the global
 * secret is a platform-wide anti-abuse control, so the public apply API cannot
 * skip it by leaving the workspace toggle off.
 *
 * `remoteip` is sent when known for stronger validation.
 */
export async function verifyTurnstileToken(
  token: string | null,
  workspaceId: string,
  remoteIp?: string | null,
  enforced = true,
): Promise<boolean> {
  const secret = await resolveTurnstileSecret(workspaceId);
  if (!secret) return true; // Not configured -> skip

  // Platform-enforced mode: a global secret means the token is mandatory.
  if (enforced) {
    if (!token) return false;
  } else if (!token) {
    // Org-scoped mode only: if this workspace didn't send a token, skip.
    return true;
  }

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      response: token,
      ...(remoteIp ? { remoteip: remoteIp } : {}),
    }),
  });

  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
