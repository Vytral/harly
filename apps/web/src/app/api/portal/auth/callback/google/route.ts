import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { type NextRequest } from "next/server";
import type { Route } from "next";

import {
  exchangeGoogleCode,
  findOrCreateCandidateByEmail,
  isPortalEnabled,
} from "@/lib/portal-auth";
import { getPortalAuthMethods } from "@/lib/portal-auth-methods";
import { auditPortalEvent } from "@/lib/portal-credentials";
import { establishPortalSession } from "@/lib/portal-session";
import { PORTAL_OAUTH_STATE_COOKIE, verifyPortalOAuthState } from "@/lib/portal-oauth-state";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state") ?? "";
  const cookieStore = await cookies();
  const oauthState = verifyPortalOAuthState(cookieStore.get(PORTAL_OAUTH_STATE_COOKIE)?.value, state);
  if (!oauthState) redirect("/portal/login?error=oauth_state" as Route);

  if (!code) redirect("/portal/login?error=oauth_denied" as Route);

  const appUrl = getHarlyPublicOrigin();
  const redirectUri = `${appUrl}/api/portal/auth/callback/google`;

  try {
    const workspaceId = oauthState!.workspaceId;
    if (!(await isPortalEnabled(workspaceId))) redirect("/portal/login?error=no_workspace" as Route);
    if (!(await getPortalAuthMethods(workspaceId)).oauth.google) redirect("/portal/login?error=method_disabled" as Route);
    const userInfo = await exchangeGoogleCode(code!, redirectUri, workspaceId);

    const candidateId = await findOrCreateCandidateByEmail(
      workspaceId,
      userInfo.email,
      { firstName: userInfo.firstName, lastName: userInfo.lastName },
      userInfo.avatarUrl,
    );

    const ua = request.headers.get("user-agent") ?? undefined;
    cookieStore.delete(PORTAL_OAUTH_STATE_COOKIE);
    await establishPortalSession(candidateId, workspaceId, ua);
    await auditPortalEvent({ workspaceId, candidateId, email: userInfo.email, action: "portal.login", metadata: { method: "google" } });

    redirect(oauthState!.next as Route);
  } catch (err) {
    unstable_rethrow(err);
    console.error("Google OAuth callback error:", err);
    redirect("/portal/login?error=oauth_failed" as Route);
  }
}
