import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getWorkspaceSlackCredentials } from "@/lib/slack/config";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createInstallState } from "@/server/oauth-state";

export const runtime = "nodejs";

/**
 * GET /api/integrations/slack/install
 *
 * Requires integrations:manage, creates a server-side nonce bound to the
 * acting user + workspace, then redirects to Slack's OAuth V2 consent screen.
 * Credentials are read from the workspace DB row (or env fallback).
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = session.session.activeOrganizationId;
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No workspace available for this account." },
      { status: 400 },
    );
  }

  await requirePermission("integrations:manage");

  const credentials = await getWorkspaceSlackCredentials(workspaceId);
  if (!credentials) {
    return NextResponse.json(
      { error: "Slack credentials not configured for this workspace." },
      { status: 503 },
    );
  }

  const appUrl = getHarlyPublicOrigin();
  const redirectUri = `${appUrl}/api/integrations/slack/callback`;

  const state = await createInstallState({
    userId: session.user.id,
    workspaceId,
    provider: "slack",
  });

  const scopes = ["chat:write", "channels:read", "groups:read"].join(",");

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
