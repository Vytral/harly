import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink, organization } from "better-auth/plugins";

import { db, schema } from "@openhire/db";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const emailFrom = process.env.EMAIL_FROM ?? "OpenHire <noreply@openhire.dev>";

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
      subject: "Sign in to OpenHire",
      text: `Use this link to sign in to OpenHire:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
    });
  } catch (error) {
    console.error("[OpenHire] Failed to send magic link email:", error);
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
    requireEmailVerification: false,
    minPasswordLength: 8,
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
    sendVerificationEmail: async ({ user, url }) => {
      // TODO: wire to @openhire/emails in a future step.
      console.log(`Verification email for ${user.email}: ${url}`);
    },
  },
  trustedOrigins: [appUrl],
});

export type Auth = typeof auth;
