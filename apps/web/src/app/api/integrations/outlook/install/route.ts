import { createHmac, randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getWorkspaceOutlookCredentials } from "@/lib/outlook/config";

export const runtime = "nodejs";

const SCOPES = [
  "Cal.ReadWrite",
  "Mail.Send",
  "offline_access",
  "User.Read",
  "OnlineMeetings.ReadWrite",
].join(" ");

/**
 * GET /api/integrations/outlook/install?ws=<workspaceId>
 *
 * Generates a Microsoft OAuth2 authorization URL and redirects the user.
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

  // Build a signed state: base64url(JSON{wsId, nonce, ts}) + "." + hmac
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

function getSigningKey(): string {
  return process.env.AI_ENCRYPTION_KEY ?? "fallback-dev-only";
}
