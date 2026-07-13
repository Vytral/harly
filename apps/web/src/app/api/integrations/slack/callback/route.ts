import { NextResponse, type NextRequest } from "next/server";

import { db, workspaceSettings } from "@harly/db";

import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { getWorkspaceSlackCredentials } from "@/lib/slack/config";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { verifyAndConsumeOauthStateNonce } from "@/server/oauth-state";

export const runtime = "nodejs";

/**
 * GET /api/integrations/slack/callback?code=...&state=...
 *
 * Slack redirects here after the user approves the OAuth install. We:
 * 1. Verify + redeem the server-side nonce (single-use, TTL, actor-bound)
 * 2. Load workspace credentials from DB (or env fallback)
 * 3. Exchange the code for an access token via slack.com/api/oauth.v2.access
 * 4. Encrypt and store the bot token in workspace_settings
 * 5. Redirect back to settings/integrations
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
    return redirectWithError(`Slack denied access: ${error}`);
  }

  if (!code || !state) {
    return redirectWithError("Missing code or state from Slack.");
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
  });
  if (!nonceCheck.ok) {
    return redirectWithError(`${nonceCheck.error} Please try again.`);
  }

  await requirePermission("integrations:manage");

  const wsId = nonceCheck.workspaceId;

  // Load credentials from workspace DB row (or env fallback)
  const credentials = await getWorkspaceSlackCredentials(wsId);
  if (!credentials) {
    return redirectWithError("Slack credentials not found for this workspace.");
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/integrations/slack/callback`;

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    team?: { id?: string; name?: string };
  };

  if (!tokenData.ok || !tokenData.access_token) {
    return redirectWithError(
      `Slack token exchange failed: ${tokenData.error ?? "unknown error"}`,
    );
  }

  // Encrypt and store
  const encrypted = encryptSecret(tokenData.access_token);

  const set: Partial<typeof workspaceSettings.$inferInsert> = {
    slackEnabled: true,
    slackTeamId: tokenData.team?.id ?? null,
    slackTeamName: tokenData.team?.name ?? null,
    slackBotTokenCiphertext: encrypted.ciphertext,
    slackBotTokenIv: encrypted.iv,
    slackBotTokenTag: encrypted.tag,
    slackEvents: [
      "application.created",
      "application.stage_changed",
      "application.hired",
      "application.rejected",
    ],
    updatedAt: new Date(),
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: wsId, ...set })
    .onConflictDoUpdate({ target: workspaceSettings.organizationId, set });

  return NextResponse.redirect(
    `${appUrl}/settings/integrations?slack=connected`,
  );
}

function redirectWithError(msg: string) {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const url = new URL(`${appUrl}/settings/integrations`);
  url.searchParams.set("slack_error", msg);
  return NextResponse.redirect(url.toString());
}
