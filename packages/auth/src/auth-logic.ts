import { APIError } from "better-auth/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal DB interface required by the auth logic. Accepts the real Drizzle
 *  client or a test double — no Postgres connection needed in unit tests. */
export interface AuthDb {
  organizationExists(): Promise<boolean>;
  hasPendingInvitation(email: string): Promise<boolean>;
}

export interface EmailSender {
  send(options: { to: string; subject: string }): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Social provider builder
// ─────────────────────────────────────────────────────────────────────────────

export type SocialProviders = Record<
  string,
  { clientId: string; clientSecret: string; tenantId?: string; mapProfileToUser?: (profile: Record<string, unknown>) => Record<string, unknown> }
>;

/**
 * Returns a mapProfileToUser function for the given provider that extracts
 * image, linkedinUrl, and githubUrl from the OAuth profile.
 */
function getProfileMapper(provider: string) {
  return (profile: Record<string, unknown>): Record<string, unknown> => {
    const updates: Record<string, unknown> = {};

    if (provider === "google") {
      updates.image = profile.picture ?? null;
    } else if (provider === "github") {
      updates.image = profile.avatar_url ?? null;
      updates.githubUrl = profile.html_url ?? null;
    } else if (provider === "linkedin") {
      updates.image = profile.picture ?? null;
    } else if (provider === "microsoft") {
      updates.image = profile.picture ?? null;
    }

    return updates;
  };
}

/**
 * Builds the socialProviders config object from environment variables.
 * A provider is only included when BOTH its clientId and clientSecret are set.
 * Accepts an optional env map so it can be called with a test fixture.
 */
export function buildSocialProviders(
  env: Record<string, string | undefined> = process.env,
): SocialProviders {
  const providers: SocialProviders = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      mapProfileToUser: getProfileMapper("google"),
    };
  }

  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    providers.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      tenantId: "common",
      mapProfileToUser: getProfileMapper("microsoft"),
    };
  }

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      mapProfileToUser: getProfileMapper("github"),
    };
  }

  if (env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET) {
    providers.linkedin = {
      clientId: env.LINKEDIN_CLIENT_ID,
      clientSecret: env.LINKEDIN_CLIENT_SECRET,
      mapProfileToUser: getProfileMapper("linkedin"),
    };
  }

  return providers;
}

/**
 * Builds social providers from database-stored OAuth credentials.
 * Falls back to environment variables when no DB config exists.
 * Caches results for 5 minutes to avoid hitting the DB on every request.
 */
let cachedProviders: SocialProviders | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function buildDynamicSocialProviders(
  getDbCredentials: (provider: string) => Promise<{ clientId: string; clientSecret: string } | null>,
): Promise<SocialProviders> {
  const now = Date.now();
  
  // Return cached if fresh
  if (cachedProviders && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProviders;
  }

  const providers: SocialProviders = {};
  const providerNames = ["google", "microsoft", "github", "linkedin"];

  for (const providerName of providerNames) {
    // Try DB first
    const dbCreds = await getDbCredentials(providerName);
    if (dbCreds) {
      providers[providerName] = {
        clientId: dbCreds.clientId,
        clientSecret: dbCreds.clientSecret,
        ...(providerName === "microsoft" ? { tenantId: "common" } : {}),
        mapProfileToUser: getProfileMapper(providerName),
      };
      continue;
    }

    // Fallback to env vars
    const envClientId = process.env[`${providerName.toUpperCase()}_CLIENT_ID`];
    const envClientSecret = process.env[`${providerName.toUpperCase()}_CLIENT_SECRET`];
    
    if (envClientId && envClientSecret) {
      providers[providerName] = {
        clientId: envClientId,
        clientSecret: envClientSecret,
        ...(providerName === "microsoft" ? { tenantId: "common" } : {}),
        mapProfileToUser: getProfileMapper(providerName),
      };
    }
  }

  // Update cache
  cachedProviders = providers;
  cacheTimestamp = now;

  return providers;
}

/** Invalidate the cached providers (e.g., after config changes). */
export function invalidateProviderCache(): void {
  cachedProviders = null;
  cacheTimestamp = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Email dispatch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends an auth email via the provided sender, falling back to a console log
 * when no sender is configured (dev / fresh self-host).
 */
export async function sendAuthEmail(options: {
  to: string;
  subject: string;
  fallbackLog: string;
  sender: EmailSender | null;
}): Promise<void> {
  if (!options.sender) {
    console.log(options.fallbackLog);
    return;
  }

  try {
    await options.sender.send({ to: options.to, subject: options.subject });
  } catch (error) {
    console.error(`[Harly] Failed to send "${options.subject}":`, error);
    console.log(options.fallbackLog);
  }
}

/**
 * Sends a magic-link sign-in email.  When no RESEND_API_KEY is present the
 * link is printed to the console so the developer can still follow it.
 */
export async function sendMagicLinkEmail(options: {
  email: string;
  url: string;
  apiKey: string | undefined;
  /** emailFrom override — defaults to "Harly <noreply@harly.dev>" */
  from?: string;
  /** Injected Resend client factory; defaults to dynamic import in production */
  sendFn?: (args: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }) => Promise<void>;
}): Promise<void> {
  const { email, url, apiKey } = options;

  if (!apiKey) {
    console.log(`Magic link for ${email}: ${url}`);
    return;
  }

  const from = options.from ?? "Harly <noreply@harly.dev>";

  try {
    if (options.sendFn) {
      await options.sendFn({
        from,
        to: email,
        subject: "Sign in to Harly",
        text: `Use this link to sign in to Harly:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
      });
    } else {
      const { Resend } = await import("resend");
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from,
        to: email,
        subject: "Sign in to Harly",
        text: `Use this link to sign in to Harly:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
      });
    }
  } catch (error) {
    console.error("[Harly] Failed to send magic link email:", error);
    console.log(`Magic link for ${email}: ${url}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invite-only signup gate
// ─────────────────────────────────────────────────────────────────────────────

export type UserCreateHookResult =
  | { data: { email: string; [key: string]: unknown } }
  | never;

/**
 * Enforces the invite-only single-org rule before a new user account is created.
 *
 * Rules:
 * 1. If no organisation exists yet → allow (bootstrap owner).
 * 2. If a valid pending invitation exists for this email → allow.
 * 3. Otherwise → throw APIError("BAD_REQUEST").
 */
export async function enforceInviteOnly(
  user: { email: string; [key: string]: unknown },
  db: AuthDb,
): Promise<{ data: typeof user }> {
  if (!(await db.organizationExists())) {
    return { data: user };
  }

  if (await db.hasPendingInvitation(user.email)) {
    return { data: user };
  }

  throw new APIError("BAD_REQUEST", {
    message: "Signups are invite-only. Ask a workspace admin to invite you.",
  });
}
