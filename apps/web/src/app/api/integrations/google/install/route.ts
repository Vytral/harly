import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { createOAuth2Client } from "@/lib/gcal/config";
import { createInstallState } from "@/server/oauth-state";

export const runtime = "nodejs";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * GET /api/integrations/google/install?ws=<workspaceId>
 *
 * Creates a server-side nonce bound to the acting user + workspace, then
 * redirects to Google's OAuth consent screen. Offline access is requested so
 * we receive a refresh token for long-lived calendar access.
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

  const state = await createInstallState({
    userId: session.user.id,
    workspaceId: session.session.activeOrganizationId ?? workspaceId,
    provider: "google",
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state,
    prompt: "consent",
    include_granted_scopes: true,
  });

  return NextResponse.redirect(url);
}
