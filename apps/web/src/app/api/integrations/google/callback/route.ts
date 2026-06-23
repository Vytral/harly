import { createHmac } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { db, workspaceSettings } from "@harly/db";

import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { createOAuth2Client } from "@/lib/gcal/config";

export const runtime = "nodejs";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * GET /api/integrations/google/callback?code=...&state=...
 *
 * Google redirects here after consent. We exchange the code for tokens,
 * encrypt the refresh token, fetch the user's email, and store everything.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return redirectWithError("Unauthorized. Please log in first.");
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return redirectWithError(`Google denied access: ${error}`);
  }

  if (!code || !state) {
    return redirectWithError("Missing code or state from Google.");
  }

  const wsId = verifyState(state);
  if (!wsId) {
    return redirectWithError("Invalid or expired state. Please try again.");
  }

  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) {
    return redirectWithError("Google OAuth credentials not configured.");
  }

  // Exchange code for tokens
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    return redirectWithError(
      "No refresh token received. Please revoke access at myaccount.google.com/permissions and try again.",
    );
  }

  // Fetch connected Google account email
  oauth2Client.setCredentials(tokens);
  let accountEmail: string | null = null;
  try {
    const res = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      },
    );
    if (res.ok) {
      const info = (await res.json()) as { email?: string };
      accountEmail = info.email ?? null;
    }
  } catch {
    // Non-critical — proceed without email
  }

  const encrypted = encryptSecret(tokens.refresh_token);

  const set: Partial<typeof workspaceSettings.$inferInsert> = {
    gcalEnabled: true,
    gcalAccountEmail: accountEmail,
    gcalCalendarId: "primary",
    gcalRefreshTokenCiphertext: encrypted.ciphertext,
    gcalRefreshTokenIv: encrypted.iv,
    gcalRefreshTokenTag: encrypted.tag,
    updatedAt: new Date(),
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: wsId, ...set })
    .onConflictDoUpdate({ target: workspaceSettings.organizationId, set });

  const appUrl = getAppUrl();
  return NextResponse.redirect(
    `${appUrl}/settings/integrations?gcal=connected`,
  );
}

function verifyState(state: string): string | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;

  const expected = createHmac("sha256", getSigningKey())
    .update(payload)
    .digest("base64url");
  if (sig !== expected) return null;

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { ws?: string; t?: number };

    if (!data.ws) return null;
    if (data.t && Date.now() - data.t > STATE_MAX_AGE_MS) return null;

    return data.ws;
  } catch {
    return null;
  }
}

function getSigningKey(): string {
  return process.env.AI_ENCRYPTION_KEY ?? "fallback-dev-only";
}

function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
}

function redirectWithError(msg: string) {
  const url = new URL(`${getAppUrl()}/settings/integrations`);
  url.searchParams.set("gcal_error", msg);
  return NextResponse.redirect(url.toString());
}
