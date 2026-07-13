import { type NextRequest, NextResponse } from "next/server";

import {
  buildGoogleAuthUrl,
  buildGitHubAuthUrl,
  buildLinkedInAuthUrl,
  isPortalEnabled,
} from "@/lib/portal-auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api-portal-auth");

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isPortalEnabled())) {
    return NextResponse.json({ error: "Portal not enabled." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  const next = searchParams.get("next") ?? "/portal/dashboard";

  // CSRF state encodes the intended redirect.
  const state = Buffer.from(JSON.stringify({ next, ts: Date.now() })).toString(
    "base64url",
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    if (provider === "google") {
      const redirectUri = `${appUrl}/api/portal/auth/callback/google`;
      const url = await buildGoogleAuthUrl(redirectUri, state);
      return NextResponse.redirect(url);
    }

    if (provider === "github") {
      const redirectUri = `${appUrl}/api/portal/auth/callback/github`;
      const url = await buildGitHubAuthUrl(redirectUri, state);
      return NextResponse.redirect(url);
    }

    if (provider === "linkedin") {
      const redirectUri = `${appUrl}/api/portal/auth/callback/linkedin`;
      const url = await buildLinkedInAuthUrl(redirectUri, state);
      return NextResponse.redirect(url);
    }

    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  } catch (err) {
    log.error(err, "portal auth route failed");
    const msg = err instanceof Error ? err.message : "OAuth unavailable.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
