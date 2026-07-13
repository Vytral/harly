import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getWorkspaceOutlookCredentials } from "@/lib/outlook/config";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createInstallState } from "@/server/oauth-state";

export const runtime = "nodejs";

const SCOPES = [
  "Cal.ReadWrite",
  "Mail.Send",
  "offline_access",
  "User.Read",
  "OnlineMeetings.ReadWrite",
].join(" ");

/**
 * GET /api/integrations/outlook/install
 *
 * Requires integrations:manage, creates a server-side nonce bound to the
 * acting user + workspace, then redirects to Microsoft's consent screen.
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

  const credentials = await getWorkspaceOutlookCredentials(workspaceId);
  if (!credentials) {
    return NextResponse.json(
      {
        error:
          "Microsoft Outlook credentials not configured for this workspace.",
      },
      { status: 503 },
    );
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/integrations/outlook/callback`;

  const state = await createInstallState({
    userId: session.user.id,
    workspaceId,
    provider: "outlook",
  });

  const url = new URL(
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  );
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_mode", "query");

  return NextResponse.redirect(url.toString());
}
