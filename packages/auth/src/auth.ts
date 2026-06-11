import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink, organization } from "better-auth/plugins";

import { db, schema } from "@harly/db";
import {
  createEmailSender,
  ResetPasswordEmail,
  resetPasswordSubject,
  VerifyEmail,
  verifyEmailSubject,
  type SendEmailOptions,
} from "@harly/emails";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
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

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  plugins: [
    organization(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
    nextCookies(),
  ],
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {},
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
