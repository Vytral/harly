import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getZoomCredentials } from "@/lib/zoom/config";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createInstallState } from "@/server/oauth-state";

export const runtime = "nodejs";

/**
 * GET /api/integrations/zoom/install
 *
 * Requires integrations:manage, creates a server-side nonce bound to the
 * acting user + workspace, then redirects to Zoom's authorization URL.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return redirectWithError("Unauthorized. Please log in first.");
  }

  const wsId = session.session.activeOrganizationId;
  if (!wsId) {
    return redirectWithError("No workspace available for this account.");
  }

  await requirePermission("integrations:manage");

  const credentials = await getZoomCredentials(wsId);
  if (!credentials) {
    return redirectWithError("Zoom credentials not configured for this workspace.");
  }

  const state = await createInstallState({
    userId: session.user.id,
    workspaceId: wsId,
    provider: "zoom",
  });

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

function redirectWithError(msg: string) {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const url = new URL(`${appUrl}/settings/integrations`);
  url.searchParams.set("zoom_error", msg);
  return NextResponse.redirect(url.toString());
}
