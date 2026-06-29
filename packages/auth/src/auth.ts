import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink, organization, twoFactor } from "better-auth/plugins";
import { sso } from "@better-auth/sso";

import { db, schema, oauthProviders } from "@harly/db";
import { eq, and } from "drizzle-orm";
import {
  createEmailSender,
  ResetPasswordEmail,
  resetPasswordSubject,
  VerifyEmail,
  verifyEmailSubject,
  type SendEmailOptions,
} from "@harly/emails";
import { decryptSecret, isEncryptionConfigured } from "./crypto-adapter";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const emailFrom = process.env.EMAIL_FROM ?? "Harly <noreply@harly.dev>";

/**
 * Send an auth email via Resend, falling back to a server-console log when no
 * RESEND_API_KEY is configured (dev / fresh self-host) — the URL in the log
 * keeps the flow usable end-to-end.
 */
async function sendAuthEmail(options: {
  to: string;
  subject: string;
  react: SendEmailOptions["react"];
  /** Logged (and used as plain-text context) when no sender is configured. */
  fallbackLog: string;
}) {
  const sender = createEmailSender();

  if (!sender) {
    console.log(options.fallbackLog);
    return;
  }

  try {
    await sender.send({
      to: options.to,
      subject: options.subject,
      react: options.react,
    });
  } catch (error) {
    console.error(`[Harly] Failed to send "${options.subject}":`, error);
    console.log(options.fallbackLog);
  }
}

async function sendMagicLinkEmail(email: string, url: string) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`Magic link for ${email}: ${url}`);
    return;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: "Sign in to Harly",
      text: `Use this link to sign in to Harly:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
    });
  } catch (error) {
    console.error("[Harly] Failed to send magic link email:", error);
    console.log(`Magic link for ${email}: ${url}`);
  }
}

/**
 * Load OAuth credentials from the database for a given provider.
 * Returns null if not found or if encryption is not configured.
 */
async function getOAuthCredentialsFromDb(
  provider: string,
): Promise<{ clientId: string; clientSecret: string } | null> {
  if (!isEncryptionConfigured()) {
    return null;
  }

  try {
    const [row] = await db
      .select()
      .from(oauthProviders)
      .where(
        and(
          eq(oauthProviders.provider, provider),
          eq(oauthProviders.enabled, true),
        ),
      )
      .limit(1);

    if (!row || !row.clientSecretCiphertext || !row.clientSecretIv || !row.clientSecretTag) {
      return null;
    }

    const clientSecret = decryptSecret({
      ciphertext: row.clientSecretCiphertext,
      iv: row.clientSecretIv,
      tag: row.clientSecretTag,
    });

    return {
      clientId: row.clientId,
      clientSecret,
    };
  } catch (error) {
    console.error(`[Harly] Failed to load ${provider} credentials from DB:`, error);
    return null;
  }
}

/**
 * Build social providers dynamically from DB and env vars.
 * DB config takes precedence over env vars.
 */
async function buildSocialProviders() {
  const providers: Record<string, {
    clientId: string;
    clientSecret: string;
    tenantId?: string;
    mapProfileToUser?: (profile: Record<string, unknown>) => Record<string, unknown>;
  }> = {};
  const providerNames = ["google", "microsoft", "github", "linkedin"];

  for (const providerName of providerNames) {
    // Try DB first
    const dbCreds = await getOAuthCredentialsFromDb(providerName);
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

  return providers;
}

/**
 * Returns a mapProfileToUser function for the given provider that extracts
 * image, linkedinUrl, and githubUrl from the OAuth profile.
 */
function getProfileMapper(provider: string) {
  return (profile: Record<string, unknown>): Record<string, unknown> => {
    const updates: Record<string, unknown> = {};

    // Extract image from all providers
    if (provider === "google") {
      updates.image = profile.picture ?? null;
    } else if (provider === "github") {
      updates.image = profile.avatar_url ?? null;
      updates.githubUrl = profile.html_url ?? null;
    } else if (provider === "linkedin") {
      // LinkedIn OpenID Connect returns picture
      updates.image = profile.picture ?? null;
      // LinkedIn profile URL from sub (we can't get the vanity URL from OIDC)
    } else if (provider === "microsoft") {
      updates.image = profile.picture ?? null;
    }

    return updates;
  };
}

// Build social providers on module load (cached for the lifetime of the process)
// In production, this will be refreshed when the server restarts.
// For dynamic updates, we use the cache invalidation in auth-logic.ts.
let socialProvidersPromise: ReturnType<typeof buildSocialProviders> | null = null;

function getSocialProviders() {
  if (!socialProvidersPromise) {
    socialProvidersPromise = buildSocialProviders();
  }
  return socialProvidersPromise;
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  plugins: [
    organization(),
    twoFactor(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
    sso(),
    nextCookies(),
  ],
  socialProviders: await getSocialProviders(),
  emailAndPassword: {
    enabled: true,
    // Verification is encouraged via the dashboard banner, not enforced —
    // self-hosters can flip this once their email sender is configured.
    requireEmailVerification: false,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: resetPasswordSubject,
        react: ResetPasswordEmail({
          userName: user.name || user.email,
          resetUrl: url,
        }),
        fallbackLog: `Password reset for ${user.email}: ${url}`,
      });
    },
  },
  user: {
    changeEmail: {
      enabled: true,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: verifyEmailSubject,
        react: VerifyEmail({
          userName: user.name || user.email,
          verifyUrl: url,
        }),
        fallbackLog: `Verification email for ${user.email}: ${url}`,
      });
    },
  },
  trustedOrigins: [appUrl],
});

export type Auth = typeof auth;
