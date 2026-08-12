import { NextResponse, type NextRequest } from "next/server";

import { db, workspaceSettings } from "@harly/db";

import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { getWorkspaceOutlookCredentials } from "@/lib/outlook/config";
import { getMe } from "@/lib/outlook/client";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { verifyAndConsumeOauthStateNonce } from "@/server/oauth-state";

const log = createLogger("api-outlook-callback");

export const runtime = "nodejs";

/**
 * GET /api/integrations/outlook/callback?code=...&state=...
 *
 * Microsoft redirects here after the user approves OAuth consent.
 * 1. Verify + redeem the server-side nonce (single-use, TTL, actor-bound)
 * 2. Exchange code for tokens
 * 3. Fetch user profile
 * 4. Encrypt + store tokens in workspace_settings
 * 5. Redirect to settings
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
    return redirectWithError(`Microsoft denied access: ${error}`);
  }

  if (!code || !state) {
    return redirectWithError("Missing code or state from Microsoft.");
  }

  // Verify + redeem the server-side nonce: single-use, TTL-scoped, bound to the
  // user + workspace that started the install. Closes replay/escalation.
  const workspaceId = session.session.activeOrganizationId;
  if (!workspaceId) {
    return redirectWithError("No workspace available for this account.");
  }
  const nonceCheck = await verifyAndConsumeOauthStateNonce({
    state,
    userId: session.user.id,
    workspaceId,
    provider: "outlook",
  });
  if (!nonceCheck.ok) {
    return redirectWithError(`${nonceCheck.error} Please try again.`);
  }

  await requirePermission("integrations:manage");

  const wsId = nonceCheck.workspaceId;

  // Load credentials from workspace DB row (or env fallback)
  const credentials = await getWorkspaceOutlookCredentials(wsId);
  if (!credentials) {
    return redirectWithError(
      "Microsoft credentials not found for this workspace.",
    );
  }

  const appUrl = getHarlyPublicOrigin();
  const redirectUri = `${appUrl}/api/integrations/outlook/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "Cal.ReadWrite Mail.Send offline_access User.Read OnlineMeetings.ReadWrite",
      }),
    },
  );

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token || !tokenData.refresh_token) {
    return redirectWithError(
      `Token exchange failed: ${tokenData.error ?? "unknown"} , ${tokenData.error_description ?? ""}`,
    );
  }

  // Fetch user profile for display
  let accountEmail: string | null = null;
  try {
    const user = await getMe(tokenData.access_token);
    accountEmail = user.mail ?? null;
  } catch (err) {
    log.error(err, "Failed to fetch Outlook user profile");
  }

  // Encrypt and store tokens
  const encryptedAccess = encryptSecret(tokenData.access_token);
  const encryptedRefresh = encryptSecret(tokenData.refresh_token);

  const set: Partial<typeof workspaceSettings.$inferInsert> = {
    outlookEnabled: true,
    outlookAccountEmail: accountEmail,
    outlookAccessTokenCiphertext: encryptedAccess.ciphertext,
    outlookAccessTokenIv: encryptedAccess.iv,
    outlookAccessTokenTag: encryptedAccess.tag,
    outlookRefreshTokenCiphertext: encryptedRefresh.ciphertext,
    outlookRefreshTokenIv: encryptedRefresh.iv,
    outlookRefreshTokenTag: encryptedRefresh.tag,
    outlookEvents: [
      "interview.scheduled",
      "interview.canceled",
      "interview.rescheduled",
    ],
    updatedAt: new Date(),
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: wsId, ...set })
    .onConflictDoUpdate({ target: workspaceSettings.organizationId, set });

  return NextResponse.redirect(
    `${appUrl}/settings/integrations?outlook=connected`,
  );
}

function redirectWithError(msg: string) {
  const appUrl = getHarlyPublicOrigin();
  const url = new URL(`${appUrl}/settings/integrations`);
  url.searchParams.set("outlook_error", msg);
  return NextResponse.redirect(url.toString());
}
