import { createHmac } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { db, workspaceSettings } from "@harly/db";

import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { getWorkspaceSlackCredentials } from "@/lib/slack/config";

const log = createLogger("api-slack-callback");

export const runtime = "nodejs";

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/integrations/slack/callback?code=...&state=...
 *
 * Slack redirects here after the user approves the OAuth install. We:
 * 1. Verify state (HMAC + expiry)
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

  // Verify state
  const wsId = verifyState(state);
  if (!wsId) {
    return redirectWithError("Invalid or expired state. Please try again.");
  }

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
    log.error(error, "slack callback verifyState failed");
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
  url.searchParams.set("slack_error", msg);
  return NextResponse.redirect(url.toString());
}
