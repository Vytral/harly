import { type NextRequest, NextResponse } from "next/server";

import {
  buildGoogleAuthUrl,
  buildGitHubAuthUrl,
  buildLinkedInAuthUrl,
  getSinglePortalWorkspace,
} from "@/lib/portal-auth";
import { createLogger } from "@/lib/logger";
import { createPortalOAuthState, PORTAL_OAUTH_STATE_COOKIE } from "@/lib/portal-oauth-state";

const log = createLogger("api-portal-auth");

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  const next = searchParams.get("next") ?? "/portal/dashboard";
  const workspace = await getSinglePortalWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Portal not enabled." }, { status: 404 });
  }

  const state = createPortalOAuthState(next, workspace.id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    if (provider === "google") {
      const redirectUri = `${appUrl}/api/portal/auth/callback/google`;
      const url = await buildGoogleAuthUrl(redirectUri, state, workspace.id);
      const response = NextResponse.redirect(url);
      response.cookies.set(PORTAL_OAUTH_STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/portal/auth/callback", maxAge: 60 * 10 });
      return response;
    }

    if (provider === "github") {
      const redirectUri = `${appUrl}/api/portal/auth/callback/github`;
      const url = await buildGitHubAuthUrl(redirectUri, state, workspace.id);
      const response = NextResponse.redirect(url);
      response.cookies.set(PORTAL_OAUTH_STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/portal/auth/callback", maxAge: 60 * 10 });
      return response;
    }

    if (provider === "linkedin") {
      const redirectUri = `${appUrl}/api/portal/auth/callback/linkedin`;
      const url = await buildLinkedInAuthUrl(redirectUri, state, workspace.id);
      const response = NextResponse.redirect(url);
      response.cookies.set(PORTAL_OAUTH_STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/portal/auth/callback", maxAge: 60 * 10 });
      return response;
    }

    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  } catch (err) {
    log.error(err, "portal auth route failed");
    const msg = err instanceof Error ? err.message : "OAuth unavailable.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
