import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink, organization, twoFactor } from "better-auth/plugins";
import { sso } from "@better-auth/sso";

import {
  db,
  schema,
  organization as organizationTable,
  workspaceSettings,
  oauthProviders,
} from "@harly/db";
import { eq, and, sql } from "drizzle-orm";
import {
  createEmailSender,
  ResetPasswordEmail,
  resetPasswordSubject,
  StaffMagicLinkEmail,
  staffMagicLinkSubject,
  type EmailProviderConfig,
  type SendEmailOptions,
} from "@harly/emails";
import { decryptSecret, isEncryptionConfigured } from "./crypto-adapter";
import { loadHarlyConfig } from "@harly/config";
import { authorizeUserCreation, setupClaimCookieName } from "./setup";

const config = loadHarlyConfig(
  process.env.NEXT_PHASE === "phase-production-build"
    ? { ...process.env, NODE_ENV: "development" }
    : process.env,
);
const appUrl = config.HARLY_URL;
const allowConsoleAuthEmailFallback =
  process.env.NODE_ENV !== "production" &&
  process.env.AUTH_EMAIL_CONSOLE_FALLBACK === "true";

if (
  process.env.NODE_ENV === "production" &&
  (!process.env.AI_ENCRYPTION_KEY ||
    process.env.AI_ENCRYPTION_KEY.trim() === "")
) {
  console.warn(
    "[Harly] AI_ENCRYPTION_KEY is not set — OAuth provider secrets, mailbox credentials, and AI provider keys cannot be encrypted at rest. Set AI_ENCRYPTION_KEY before configuring those integrations.",
  );
}

/**
 * Self-host is single-org per deployment (see [[project_self_host_single_org]]),
 * so staff-facing auth emails (magic link, password reset) can resolve the
 * one workspace's own sending config directly, instead of always going out
 * as the platform's Harly <noreply@harly.dev>. Falls back to the platform
 * env config when the workspace hasn't configured its own sender.
 */
async function getSingleWorkspaceEmailConfig(): Promise<EmailProviderConfig | null> {
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
    .limit(1);

  if (!row || !row.emailEnabled || !row.emailProvider || !row.emailFrom) {
    return null;
  }

  if (row.emailProvider === "resend") {
    if (
      !row.emailApiKeyCiphertext ||
      !row.emailApiKeyIv ||
      !row.emailApiKeyTag ||
      !isEncryptionConfigured()
    ) {
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

  if (
    row.emailProvider !== "smtp" ||
    !row.emailSmtpHost ||
    !row.emailSmtpPort
  ) {
    return null;
  }

  let pass: string | undefined;
  if (row.emailApiKeyCiphertext && row.emailApiKeyIv && row.emailApiKeyTag) {
    if (!isEncryptionConfigured()) return null;
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

/**
 * Send an auth email via the workspace's own sender when configured,
 * falling back to the platform Resend/SMTP env vars otherwise. A console
 * fallback is available only through explicit opt-in in non-production
 * local development.
 */
async function sendAuthEmail(options: {
  to: string;
  subject: string;
  react: SendEmailOptions["react"];
  fallbackLog: string;
}) {
  const config = await getSingleWorkspaceEmailConfig();
  const sender = createEmailSender(config);

  if (!sender) {
    if (allowConsoleAuthEmailFallback) {
      console.log(options.fallbackLog);
      return;
    }
    throw new Error("Email delivery is not configured.");
  }

  try {
    await sender.send({
      to: options.to,
      subject: options.subject,
      react: options.react,
    });
  } catch (error) {
    console.error(`[Harly] Failed to send "${options.subject}":`, error);
    throw new Error("Failed to send authentication email.");
  }
}

async function sendMagicLinkEmail(email: string, url: string) {
  const config = await getSingleWorkspaceEmailConfig();
  const sender = createEmailSender(config);

  if (!sender) {
    if (allowConsoleAuthEmailFallback) {
      console.log(`Magic link for ${email}: ${url}`);
      return;
    }
    throw new Error("Email delivery is not configured.");
  }

  try {
    await sender.send({
      to: email,
      subject: staffMagicLinkSubject(),
      react: StaffMagicLinkEmail({ loginUrl: url }),
    });
  } catch (error) {
    console.error("[Harly] Failed to send magic link email:", error);
    throw new Error("Failed to send magic link email.");
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

    if (
      !row ||
      !row.clientSecretCiphertext ||
      !row.clientSecretIv ||
      !row.clientSecretTag
    ) {
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
    console.error(
      `[Harly] Failed to load ${provider} credentials from DB:`,
      error,
    );
    return null;
  }
}

/**
 * Build social providers dynamically from DB and env vars.
 * DB config takes precedence over env vars.
 */
async function buildSocialProviders() {
  const providers: Record<
    string,
    {
      clientId: string;
      clientSecret: string;
      tenantId?: string;
      mapProfileToUser?: (
        profile: Record<string, unknown>,
      ) => Record<string, unknown>;
    }
  > = {};
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
    const envClientSecret =
      process.env[`${providerName.toUpperCase()}_CLIENT_SECRET`];

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
let socialProvidersPromise: ReturnType<typeof buildSocialProviders> | null =
  null;

function getSocialProviders() {
  if (!socialProvidersPromise) {
    socialProvidersPromise = buildSocialProviders();
  }
  return socialProvidersPromise;
}

async function organizationExists(): Promise<boolean> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(919191)`);
    const [row] = await tx
      .select({ id: organizationTable.id })
      .from(organizationTable)
      .limit(1);
    return Boolean(row);
  });
  return result;
}

export const auth = betterAuth({
  baseURL: appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (newUser, context) => {
          await authorizeUserCreation({
            email: newUser.email,
            claimId: context?.getCookie(setupClaimCookieName(appUrl)),
            allowSsoProvisioning:
              context?.path === "/sign-in/sso" ||
              context?.path?.startsWith("/sso/callback/") === true ||
              context?.path?.startsWith("/sso/saml2/") === true,
          });
          return { data: newUser };
        },
      },
    },
  },
  plugins: [
    organization({
      organizationHooks: {
        beforeCreateOrganization: async () => {
          throw new APIError("FORBIDDEN", {
            message: (await organizationExists())
              ? "This deployment already has a workspace."
              : "Complete the initial workspace through the protected setup flow.",
          });
        },
      },
    }),
    twoFactor(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
    sso({
      providersLimit: 10,
      domainVerification: { enabled: true },
      saml: {
        enableInResponseToValidation: true,
        allowIdpInitiated: false,
        requestTTL: 5 * 60 * 1000,
        clockSkew: 2 * 60 * 1000,
        requireTimestamps: true,
        algorithms: { onDeprecated: "reject" },
        maxResponseSize: 256 * 1024,
        maxMetadataSize: 100 * 1024,
      },
    }),
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
  trustedOrigins: [appUrl],
});

export type Auth = typeof auth;
