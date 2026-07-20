import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getWorkspaceDocuSignCredentials } from "@/lib/docusign/config";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createInstallState } from "@/server/oauth-state";

export const runtime = "nodejs";

// `extended` is required for a long-lived, renewable refresh token (without it
// the refresh token has a short life and won't rotate cleanly). `impersonation`
// is JWT-only and intentionally omitted (we use Authorization Code grant).
const SCOPES = ["signature", "extended"].join(" ");

/**
 * GET /api/integrations/docusign/install
 *
 * Requires integrations:manage, creates a server-side nonce bound to the
 * acting user + workspace, then redirects to DocuSign's consent screen.
 * Starts against the OAuth host (account-d demo / account prod); the callback
 * resolves the actual REST base URL from getUserInfo.
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

  const credentials = await getWorkspaceDocuSignCredentials(workspaceId);
  if (!credentials) {
    return NextResponse.json(
      { error: "DocuSign credentials not configured for this workspace." },
      { status: 503 },
    );
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/integrations/docusign/callback`;

  const state = await createInstallState({
    userId: session.user.id,
    workspaceId,
    provider: "docusign",
  });

  const url = new URL(`${credentials.authBaseUrl.replace(/\/$/, "")}/oauth/auth`);
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
