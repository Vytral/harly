import { createHmac, randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { createOAuth2Client } from "@/lib/gcal/config";

export const runtime = "nodejs";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * GET /api/integrations/google/install?ws=<workspaceId>
 *
 * Redirects to Google OAuth consent screen. Requests offline access so we
 * receive a refresh token for long-lived calendar access.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = req.nextUrl.searchParams.get("ws");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "Missing ws parameter." },
      { status: 400 },
    );
  }

  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) {
    return NextResponse.json(
      { error: "Google OAuth credentials not configured." },
      { status: 503 },
    );
  }

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

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state,
    prompt: "consent",
    include_granted_scopes: true,
  });

  return NextResponse.redirect(url);
}

function getSigningKey(): string {
  return process.env.AI_ENCRYPTION_KEY ?? "fallback-dev-only";
}
