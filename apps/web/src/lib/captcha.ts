import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

export type CaptchaProvider = "turnstile" | "recaptcha" | "hcaptcha";

export const CAPTCHA_PROVIDERS: CaptchaProvider[] = [
  "turnstile",
  "recaptcha",
  "hcaptcha",
];

export function isCaptchaProvider(value: string): value is CaptchaProvider {
  return (
    value === "turnstile" || value === "recaptcha" || value === "hcaptcha"
  );
}

/**
 * Per-provider config. All three share the same siteverify contract
 * (`{ secret, response, remoteip } -> { success }`) and each vendor widget
 * injects its own hidden response field into the enclosing form. They differ
 * only in the verify URL, the hidden field name, the request encoding, the
 * env-var fallbacks, and which workspaceSettings columns hold the keys.
 */
type ProviderSpec = {
  /** Server-to-server token verification endpoint. */
  verifyUrl: string;
  /** Hidden input the vendor widget injects; carries the token on submit. */
  responseField: string;
  /** Cloudflare accepts JSON; Google/hCaptcha require urlencoded form bodies. */
  encoding: "json" | "form";
  siteEnv: string;
  secretEnv: string;
  cols: {
    siteKey:
      | "turnstileSiteKey"
      | "recaptchaSiteKey"
      | "hcaptchaSiteKey";
    ciphertext:
      | "turnstileSecretCiphertext"
      | "recaptchaSecretCiphertext"
      | "hcaptchaSecretCiphertext";
    iv: "turnstileSecretIv" | "recaptchaSecretIv" | "hcaptchaSecretIv";
    tag: "turnstileSecretTag" | "recaptchaSecretTag" | "hcaptchaSecretTag";
  };
};

const PROVIDERS: Record<CaptchaProvider, ProviderSpec> = {
  turnstile: {
    verifyUrl: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    responseField: "cf-turnstile-response",
    encoding: "json",
    siteEnv: "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    secretEnv: "TURNSTILE_SECRET_KEY",
    cols: {
      siteKey: "turnstileSiteKey",
      ciphertext: "turnstileSecretCiphertext",
      iv: "turnstileSecretIv",
      tag: "turnstileSecretTag",
    },
  },
  recaptcha: {
    verifyUrl: "https://www.google.com/recaptcha/api/siteverify",
    responseField: "g-recaptcha-response",
    encoding: "form",
    siteEnv: "NEXT_PUBLIC_RECAPTCHA_SITE_KEY",
    secretEnv: "RECAPTCHA_SECRET_KEY",
    cols: {
      siteKey: "recaptchaSiteKey",
      ciphertext: "recaptchaSecretCiphertext",
      iv: "recaptchaSecretIv",
      tag: "recaptchaSecretTag",
    },
  },
  hcaptcha: {
    verifyUrl: "https://api.hcaptcha.com/siteverify",
    responseField: "h-captcha-response",
    encoding: "form",
    siteEnv: "NEXT_PUBLIC_HCAPTCHA_SITE_KEY",
    secretEnv: "HCAPTCHA_SECRET_KEY",
    cols: {
      siteKey: "hcaptchaSiteKey",
      ciphertext: "hcaptchaSecretCiphertext",
      iv: "hcaptchaSecretIv",
      tag: "hcaptchaSecretTag",
    },
  },
};

/** The hidden field names every vendor widget injects, for form-based reads. */
export const CAPTCHA_RESPONSE_FIELDS = CAPTCHA_PROVIDERS.map(
  (provider) => PROVIDERS[provider].responseField,
);

/** Public-safe per-provider config state (never returns a secret). */
export type ProviderKeyStatus = {
  siteKey: string | null;
  /** True only when a secret key is stored (never the secret itself). */
  hasSecretKey: boolean;
};

export type WorkspaceCaptchaStatus = {
  /** True when a provider is switched on for this workspace. */
  enabled: boolean;
  /** The active provider, or null when none is enabled. */
  provider: CaptchaProvider | null;
  /** Config state of every provider, for the three marketplace rows. */
  providers: Record<CaptchaProvider, ProviderKeyStatus>;
  /** False when AI_ENCRYPTION_KEY is missing/invalid , secrets can't be stored. */
  encryptionReady: boolean;
};

/** Public-safe captcha status for the settings UI. Never returns a secret. */
export async function getWorkspaceCaptchaStatus(
  workspaceId: string,
): Promise<WorkspaceCaptchaStatus> {
  const [row] = await db
    .select({
      captchaEnabled: workspaceSettings.captchaEnabled,
      captchaProvider: workspaceSettings.captchaProvider,
      turnstileSiteKey: workspaceSettings.turnstileSiteKey,
      turnstileSecretCiphertext: workspaceSettings.turnstileSecretCiphertext,
      recaptchaSiteKey: workspaceSettings.recaptchaSiteKey,
      recaptchaSecretCiphertext: workspaceSettings.recaptchaSecretCiphertext,
      hcaptchaSiteKey: workspaceSettings.hcaptchaSiteKey,
      hcaptchaSecretCiphertext: workspaceSettings.hcaptchaSecretCiphertext,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  const provider =
    row?.captchaProvider && isCaptchaProvider(row.captchaProvider)
      ? row.captchaProvider
      : null;

  return {
    enabled: Boolean(row?.captchaEnabled) && provider !== null,
    provider: row?.captchaEnabled ? provider : null,
    providers: {
      turnstile: {
        siteKey: row?.turnstileSiteKey ?? null,
        hasSecretKey: Boolean(row?.turnstileSecretCiphertext),
      },
      recaptcha: {
        siteKey: row?.recaptchaSiteKey ?? null,
        hasSecretKey: Boolean(row?.recaptchaSecretCiphertext),
      },
      hcaptcha: {
        siteKey: row?.hcaptchaSiteKey ?? null,
        hasSecretKey: Boolean(row?.hcaptchaSecretCiphertext),
      },
    },
    encryptionReady: isEncryptionConfigured(),
  };
}

/** The active provider + the site key to render, or null when none is set. */
export type ResolvedCaptchaSiteKey = {
  provider: CaptchaProvider;
  siteKey: string;
};

/**
 * Resolve the provider + site key to render on the public application form.
 * Prefers the workspace's active provider (when enabled with a site key),
 * falling back to the first provider whose global NEXT_PUBLIC_* env var is set.
 * Returns null when neither is configured , the widget then renders nothing and
 * verification is skipped.
 */
export async function resolveCaptchaSiteKey(
  workspaceId: string,
): Promise<ResolvedCaptchaSiteKey | null> {
  const status = await getWorkspaceCaptchaStatus(workspaceId);
  if (status.enabled && status.provider) {
    const siteKey = status.providers[status.provider].siteKey;
    if (siteKey) return { provider: status.provider, siteKey };
  }

  for (const provider of CAPTCHA_PROVIDERS) {
    const envSiteKey = process.env[PROVIDERS[provider].siteEnv];
    if (envSiteKey) return { provider, siteKey: envSiteKey };
  }
  return null;
}

/** The active provider + its decrypted secret, for token verification. */
type ResolvedCaptchaSecret = {
  provider: CaptchaProvider;
  secret: string;
};

/**
 * Resolve the provider + secret to verify a token against. The workspace's
 * active provider secret (decrypted) wins; otherwise the first provider whose
 * global secret env var is set. Returns null when neither is configured →
 * verification is skipped.
 */
async function resolveActiveCaptchaSecret(
  workspaceId: string,
): Promise<ResolvedCaptchaSecret | null> {
  if (isEncryptionConfigured()) {
    const [row] = await db
      .select({
        captchaEnabled: workspaceSettings.captchaEnabled,
        captchaProvider: workspaceSettings.captchaProvider,
        turnstileSecretCiphertext: workspaceSettings.turnstileSecretCiphertext,
        turnstileSecretIv: workspaceSettings.turnstileSecretIv,
        turnstileSecretTag: workspaceSettings.turnstileSecretTag,
        recaptchaSecretCiphertext: workspaceSettings.recaptchaSecretCiphertext,
        recaptchaSecretIv: workspaceSettings.recaptchaSecretIv,
        recaptchaSecretTag: workspaceSettings.recaptchaSecretTag,
        hcaptchaSecretCiphertext: workspaceSettings.hcaptchaSecretCiphertext,
        hcaptchaSecretIv: workspaceSettings.hcaptchaSecretIv,
        hcaptchaSecretTag: workspaceSettings.hcaptchaSecretTag,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1);

    const provider =
      row?.captchaEnabled &&
      row.captchaProvider &&
      isCaptchaProvider(row.captchaProvider)
        ? row.captchaProvider
        : null;

    if (provider) {
      const cols = PROVIDERS[provider].cols;
      const ciphertext = row?.[cols.ciphertext];
      const iv = row?.[cols.iv];
      const tag = row?.[cols.tag];
      if (ciphertext && iv && tag) {
        try {
          return { provider, secret: decryptSecret({ ciphertext, iv, tag }) };
        } catch {
          // Fall through to env on a decryption failure.
        }
      }
    }
  }

  for (const provider of CAPTCHA_PROVIDERS) {
    const envSecret = process.env[PROVIDERS[provider].secretEnv];
    if (envSecret) return { provider, secret: envSecret };
  }
  return null;
}

/**
 * Verify a CAPTCHA token for a workspace's application form, against whichever
 * provider is active (workspace secret, else the first configured env secret).
 *
 * When no secret is configured (neither workspace nor env), verification is
 * skipped (returns true) so self-hosters without a CAPTCHA aren't blocked.
 *
 * When `enforced` (default true) and any global provider secret is set,
 * verification is REQUIRED , the global secret is a platform-wide anti-abuse
 * control, so the public apply API cannot skip it by leaving the toggle off.
 *
 * `remoteip` is sent when known for stronger validation.
 */
export async function verifyCaptchaToken(
  token: string | null,
  workspaceId: string,
  remoteIp?: string | null,
  enforced = true,
): Promise<boolean> {
  const resolved = await resolveActiveCaptchaSecret(workspaceId);
  if (!resolved) return true; // Not configured -> skip

  if (enforced) {
    if (!token) return false;
  } else if (!token) {
    // Org-scoped mode only: if this workspace didn't send a token, skip.
    return true;
  }

  const spec = PROVIDERS[resolved.provider];
  const params: Record<string, string> = {
    secret: resolved.secret,
    response: token as string,
    ...(remoteIp ? { remoteip: remoteIp } : {}),
  };

  const res =
    spec.encoding === "json"
      ? await fetch(spec.verifyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        })
      : await fetch(spec.verifyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(params).toString(),
        });

  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
