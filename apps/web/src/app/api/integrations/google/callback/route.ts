import { NextResponse, type NextRequest } from "next/server";

import { db, workspaceSettings } from "@harly/db";

import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { createOAuth2Client } from "@/lib/gcal/config";
import { createLogger } from "@/lib/logger";
import { requirePermission } from "@/features/workspaces/permissions-server";
import {
  verifyAndConsumeOauthStateNonce,
} from "@/server/oauth-state";

const log = createLogger("api-google-callback");

export const runtime = "nodejs";

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

  // Verify the server-side nonce: single-use, TTL-scoped, bound to the user +
  // workspace that started the install. This replaces the old CSRF-only state
  // check and closes replay/escalation on the integration OAuth flow.
  const actor = session.session;
  const userId = session.user.id;
  const workspaceId = actor.activeOrganizationId;
  if (!workspaceId) {
    return redirectWithError("No workspace available for this account.");
  }

  const nonceCheck = await verifyAndConsumeOauthStateNonce({
    state,
    userId,
    workspaceId,
  });
  if (!nonceCheck.ok) {
    return redirectWithError(`${nonceCheck.error} Please try again.`);
  }

  await requirePermission("integrations:manage");

  const wsId = nonceCheck.workspaceId;

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
  } catch (error) {
    log.error(error, "google callback userinfo fetch failed");
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
