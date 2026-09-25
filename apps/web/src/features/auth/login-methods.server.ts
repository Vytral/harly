import "server-only";

import { and, eq } from "drizzle-orm";
import {
  db,
  workspaceSettings,
  oauthProviders,
  ssoProvider,
} from "@harly/db";

import { isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import {
  applyLoginMethodAllowList,
  parseEnabledLoginMethods,
  SOCIAL_LOGIN_METHODS,
  type AvailableLoginMethods,
  type SocialLoginMethod,
} from "./login-methods";

const log = createLogger("auth:login-methods");

/**
 * Discover which staff login methods a Harly deployment should expose on its
 * (unauthenticated) sign-in screen.
 *
 * Harly self-host is single-org per deployment, so there is exactly one
 * workspace row to consult and no session is required. The result merges two
 * layers:
 *
 *  1. What is actually *configured* — a social provider needs real OAuth
 *     credentials (DB row with a secret, or env vars); SSO needs a registered
 *     provider; magic-link needs a working email sender.
 *  2. The admin's curated allow-list (`workspaceSettings.enabledLoginMethods`).
 *     Empty ⇒ "auto", show everything configured. Non-empty ⇒ show only the
 *     selected methods, still gated by whether they are configured.
 *
 * This never throws: on any error it degrades to a safe default
 * (email + password only) so the login screen always renders something.
 */
export async function getAvailableLoginMethods(): Promise<AvailableLoginMethods> {
  try {
    const { configured, allow } = await resolveLoginMethodState();
    return applyLoginMethodAllowList(configured, allow);
  } catch (error) {
    log.error(error, "getAvailableLoginMethods failed; falling back to password-only");
    return {
      password: true,
      passkey: false,
      magicLink: false,
      sso: false,
      social: [],
    };
  }
}

/**
 * The set of methods that are actually *configured* on this deployment,
 * BEFORE applying the admin allow-list. Used by the admin settings UI so an
 * owner can see which methods are available to select. On error, degrades to
 * password-only.
 */
export async function getConfiguredLoginMethods(): Promise<AvailableLoginMethods> {
  try {
    const { configured } = await resolveLoginMethodState();
    return configured;
  } catch (error) {
    log.error(error, "getConfiguredLoginMethods failed; falling back to password-only");
    return {
      password: true,
      passkey: true,
      magicLink: false,
      sso: false,
      social: [],
    };
  }
}

/**
 * Shared resolution: reads the single workspace row once and computes both the
 * configured method set and the parsed admin allow-list.
 */
async function resolveLoginMethodState(): Promise<{
  configured: AvailableLoginMethods;
  allow: ReturnType<typeof parseEnabledLoginMethods>;
}> {
  const [settings] = await db
    .select({
      organizationId: workspaceSettings.organizationId,
      enabledLoginMethods: workspaceSettings.enabledLoginMethods,
      emailEnabled: workspaceSettings.emailEnabled,
      emailProvider: workspaceSettings.emailProvider,
      emailFrom: workspaceSettings.emailFrom,
      emailApiKeyCiphertext: workspaceSettings.emailApiKeyCiphertext,
      emailSmtpHost: workspaceSettings.emailSmtpHost,
      emailSmtpPort: workspaceSettings.emailSmtpPort,
    })
    .from(workspaceSettings)
    .limit(1);

  const configured: AvailableLoginMethods = {
    // Email + password is always a valid staff credential in Harly.
    password: true,
    // Passkey has no server-side config; it is browser-capability gated in
    // the client. Expose it here and let the client decide.
    passkey: true,
    magicLink: isStaffEmailDeliverable(settings),
    sso: await hasEnabledSsoProvider(settings?.organizationId),
    social: await getConfiguredSocialProviders(settings?.organizationId),
  };

  const allow = parseEnabledLoginMethods(settings?.enabledLoginMethods);
  return { configured, allow };
}

/**
 * Whether staff auth emails (magic link, password reset) can actually be
 * delivered. Mirrors the resolution order in `packages/auth/src/auth.ts`:
 * a workspace's own configured sender, else the platform `RESEND_API_KEY`
 * env var.
 */
function isStaffEmailDeliverable(
  settings:
    | {
        emailEnabled: boolean | null;
        emailProvider: string | null;
        emailFrom: string | null;
        emailApiKeyCiphertext: string | null;
        emailSmtpHost: string | null;
        emailSmtpPort: number | null;
      }
    | undefined,
): boolean {
  // Platform env fallback (Resend).
  if (process.env.RESEND_API_KEY) {
    return true;
  }

  if (!settings || !settings.emailEnabled || !settings.emailFrom) {
    return false;
  }

  if (settings.emailProvider === "resend") {
    // Needs the encrypted API key + a working master key to decrypt it.
    return Boolean(settings.emailApiKeyCiphertext) && isEncryptionConfigured();
  }

  if (settings.emailProvider === "smtp") {
    // Must match what the sender requires, or a method is advertised that
    // cannot deliver. Both packages/auth/src/auth.ts and
    // apps/web/src/lib/email/config.ts build no transport at all without a host
    // *and* a port. A password is genuinely optional (open relay / local).
    return Boolean(settings.emailSmtpHost) && Boolean(settings.emailSmtpPort);
  }

  return false;
}

/** Whether at least one enabled enterprise SSO provider is registered. */
async function hasEnabledSsoProvider(
  organizationId: string | undefined,
): Promise<boolean> {
  const rows = await db
    .select({ id: ssoProvider.id })
    .from(ssoProvider)
    .where(
      organizationId
        ? and(
            eq(ssoProvider.enabled, true),
            eq(ssoProvider.organizationId, organizationId),
          )
        : eq(ssoProvider.enabled, true),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * The social providers with real, usable credentials, in a stable display
 * order. A provider counts as configured when it has an enabled DB row with a
 * stored secret, OR both env vars (`{PROVIDER}_CLIENT_ID` + `_SECRET`) are set.
 * This mirrors `buildSocialProviders()` in packages/auth so the UI never shows
 * a button the server would reject.
 */
async function getConfiguredSocialProviders(
  organizationId: string | undefined,
): Promise<SocialLoginMethod[]> {
  const dbEnabled = new Map<string, boolean>();

  if (organizationId) {
    const rows = await db
      .select({
        provider: oauthProviders.provider,
        enabled: oauthProviders.enabled,
        hasSecret: oauthProviders.clientSecretCiphertext,
      })
      .from(oauthProviders)
      .where(eq(oauthProviders.workspaceId, organizationId));

    for (const row of rows) {
      dbEnabled.set(row.provider, row.enabled && Boolean(row.hasSecret));
    }
  }

  const result: SocialLoginMethod[] = [];
  for (const provider of SOCIAL_LOGIN_METHODS) {
    // DB config (only trustworthy when we can decrypt the secret at runtime).
    if (dbEnabled.get(provider) && isEncryptionConfigured()) {
      result.push(provider);
      continue;
    }
    // Env-var fallback.
    const envId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
    const envSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
    if (envId && envSecret) {
      result.push(provider);
    }
  }

  return result;
}
