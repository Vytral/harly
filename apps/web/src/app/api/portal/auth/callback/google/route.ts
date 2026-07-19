import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";
import type { Route } from "next";

import {
  PORTAL_SESSION_COOKIE,
  createPortalSession,
  exchangeGoogleCode,
  findOrCreateCandidateByEmail,
  isPortalEnabled,
} from "@/lib/portal-auth";
import { PORTAL_OAUTH_STATE_COOKIE, verifyPortalOAuthState } from "@/lib/portal-oauth-state";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state") ?? "";
  const cookieStore = await cookies();
  const oauthState = verifyPortalOAuthState(cookieStore.get(PORTAL_OAUTH_STATE_COOKIE)?.value, state);
  if (!oauthState) redirect("/portal/login?error=oauth_state" as Route);

  if (!code) redirect("/portal/login?error=oauth_denied" as Route);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/portal/auth/callback/google`;

  try {
    const workspaceId = oauthState!.workspaceId;
    if (!(await isPortalEnabled(workspaceId))) redirect("/portal/login?error=no_workspace" as Route);
    const userInfo = await exchangeGoogleCode(code!, redirectUri, workspaceId);

    const candidateId = await findOrCreateCandidateByEmail(
      workspaceId,
      userInfo.email,
      { firstName: userInfo.firstName, lastName: userInfo.lastName },
      userInfo.avatarUrl,
    );

    const ua = request.headers.get("user-agent") ?? undefined;
    const raw = await createPortalSession(candidateId, workspaceId, ua);

    cookieStore.delete(PORTAL_OAUTH_STATE_COOKIE);
    cookieStore.set(PORTAL_SESSION_COOKIE, raw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    redirect(oauthState!.next as Route);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    redirect("/portal/login?error=oauth_failed" as Route);
  }
}
