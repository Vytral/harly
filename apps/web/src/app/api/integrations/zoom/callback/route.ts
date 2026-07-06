import { createHmac } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { db, workspaceSettings } from "@harly/db";

import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { getZoomCredentials } from "@/lib/zoom/config";

const log = createLogger("api-zoom-callback");

export const runtime = "nodejs";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

type ZoomTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

type ZoomUserInfoResponse = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  account_id: string;
};

/**
 * GET /api/integrations/zoom/callback?code=...&state=...
 *
 * Zoom redirects here after the user approves the OAuth install. We:
 * 1. Verify state (HMAC + expiry)
 * 2. Load workspace credentials from DB (or env fallback)
 * 3. Exchange the code for an access token
 * 4. Fetch user info to get account details
 * 5. Encrypt and store tokens in workspace_settings
 * 6. Redirect back to settings/integrations
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
    return redirectWithError(`Zoom denied access: ${error}`);
  }

  if (!code || !state) {
    return redirectWithError("Missing code or state from Zoom.");
  }

  // Verify state
  const wsId = verifyState(state);
  if (!wsId) {
    return redirectWithError("Invalid or expired state. Please try again.");
  }

  // Load credentials
  const credentials = await getZoomCredentials(wsId);
  if (!credentials) {
    return redirectWithError("Zoom credentials not found for this workspace.");
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/integrations/zoom/callback`;

  // Exchange code for token
  const tokenRes = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.json().catch(() => null);
    log.error({ body }, "Zoom token exchange failed");
    return redirectWithError("Token exchange failed. Please try again.");
  }

  const tokenData = (await tokenRes.json()) as ZoomTokenResponse;

  // Fetch user info
  const userRes = await fetch("https://api.zoom.us/v2/users/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    log.error({ status: userRes.status }, "Zoom user info fetch failed");
    return redirectWithError("Failed to fetch Zoom account info.");
  }

  const userData = (await userRes.json()) as ZoomUserInfoResponse;

  // Encrypt and store
  const encryptedToken = encryptSecret(tokenData.access_token);
  const encryptedRefresh = encryptSecret(tokenData.refresh_token);

  const set: Partial<typeof workspaceSettings.$inferInsert> = {
    zoomEnabled: true,
    zoomAccountId: userData.id,
    zoomAccountEmail: userData.email,
    zoomTokenCiphertext: encryptedToken.ciphertext,
    zoomTokenIv: encryptedToken.iv,
    zoomTokenTag: encryptedToken.tag,
    zoomRefreshTokenCiphertext: encryptedRefresh.ciphertext,
    zoomRefreshTokenIv: encryptedRefresh.iv,
    zoomRefreshTokenTag: encryptedRefresh.tag,
    updatedAt: new Date(),
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: wsId, ...set })
    .onConflictDoUpdate({ target: workspaceSettings.organizationId, set });

  return NextResponse.redirect(
    `${appUrl}/settings/integrations?zoom=connected`,
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
  } catch (error) {
    log.error(error, "zoom callback verifyState failed");
    return null;
  }
}

function getSigningKey(): string {
  return process.env.AI_ENCRYPTION_KEY ?? "fallback-dev-only";
}

function redirectWithError(msg: string) {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const url = new URL(`${appUrl}/settings/integrations`);
  url.searchParams.set("zoom_error", msg);
  return NextResponse.redirect(url.toString());
}
