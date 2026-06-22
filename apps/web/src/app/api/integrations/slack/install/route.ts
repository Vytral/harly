import { createHmac, randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getWorkspaceSlackCredentials } from "@/lib/slack/config";

export const runtime = "nodejs";

/**
 * GET /api/integrations/slack/install?ws=<workspaceId>
 *
 * Generates a Slack OAuth V2 authorization URL and redirects the user to it.
 * Credentials are read from the workspace DB row (or env fallback).
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = req.nextUrl.searchParams.get("ws");
  if (!workspaceId) {
    return NextResponse.json({ error: "Missing ws parameter." }, { status: 400 });
  }

  const credentials = await getWorkspaceSlackCredentials(workspaceId);
  if (!credentials) {
    return NextResponse.json(
      { error: "Slack credentials not configured for this workspace." },
      { status: 503 },
    );
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/integrations/slack/callback`;

  // Build a signed state: base64url(JSON{wsId, nonce, ts}) + "." + hmac
  const statePayload = JSON.stringify({
    ws: workspaceId,
    n: randomBytes(16).toString("hex"),
    t: Date.now(),
  });
  const stateB64 = Buffer.from(statePayload).toString("base64url");
  const hmac = createHmac("sha256", getSigningKey())
    .update(stateB64)
    .digest("base64url");
  const state = `${stateB64}.${hmac}`;

  const scopes = ["chat:write", "channels:read", "groups:read"].join(",");

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}

function getSigningKey(): string {
  return process.env.AI_ENCRYPTION_KEY ?? "fallback-dev-only";
}
