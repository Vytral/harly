import { createHmac } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getZoomCredentials } from "@/lib/zoom/config";

export const runtime = "nodejs";

/**
 * GET /api/integrations/zoom/install?ws=<workspaceId>
 *
 * Initiates Zoom OAuth flow. Generates HMAC-signed state, stores pending
 * state in workspace_settings, and redirects to Zoom authorization URL.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return redirectWithError("Unauthorized. Please log in first.");
  }

  const wsId = req.nextUrl.searchParams.get("ws");
  if (!wsId) {
    return redirectWithError("Missing workspace ID.");
  }

  const credentials = await getZoomCredentials(wsId);
  if (!credentials) {
    return redirectWithError("Zoom credentials not configured for this workspace.");
  }

  const state = buildState(wsId);

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");

  const authUrl = new URL("https://zoom.us/oauth/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", credentials.clientId);
  authUrl.searchParams.set("redirect_uri", `${appUrl}/api/integrations/zoom/callback`);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", "meeting:write");

  return NextResponse.redirect(authUrl);
}

function buildState(wsId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ ws: wsId, t: Date.now() }),
  ).toString("base64url");

  const sig = createHmac("sha256", getSigningKey())
    .update(payload)
    .digest("base64url");

  return `${payload}.${sig}`;
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
