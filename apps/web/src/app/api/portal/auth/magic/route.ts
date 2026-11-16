import { NextResponse, type NextRequest } from "next/server";

import {
  consumeMagicLinkToken,
  findOrCreateCandidateByEmail,
  isPortalEnabled,
} from "@/lib/portal-auth";
import { auditPortalEvent } from "@/lib/portal-credentials";
import { establishPortalSession } from "@/lib/portal-session";
import { getPortalAuthMethods } from "@/lib/portal-auth-methods";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";

function redirectTo(path: string, status = 303): NextResponse {
  return NextResponse.redirect(new URL(path, getHarlyPublicOrigin()), status);
}

/**
 * Opening an emailed link must never consume the one-time token: mail
 * scanners and link previewers issue GET requests. GET only forwards to the
 * confirmation page; the token is consumed by the POST below.
 */
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return redirectTo("/portal/login?error=missing_token", 302);
  return redirectTo(`/portal/magic?token=${encodeURIComponent(token)}`, 302);
}

export async function POST(request: NextRequest) {
  // The confirm form is same-origin; refuse forged cross-site submissions that
  // could sign a victim into an attacker-chosen account.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return redirectTo("/portal/login?error=invalid_token");
  }

  let token: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get("token");
    token = typeof value === "string" ? value : null;
  } catch {
    token = null;
  }
  if (!token) return redirectTo("/portal/login?error=missing_token");

  const result = await consumeMagicLinkToken(token);
  if (!result) return redirectTo("/portal/login?error=invalid_token");

  const workspaceId = result.workspaceId;
  if (!(await isPortalEnabled(workspaceId))) {
    return redirectTo("/portal/login?error=no_workspace");
  }

  if (!(await getPortalAuthMethods(workspaceId)).magicLink) {
    return redirectTo("/portal/login?error=method_disabled");
  }

  let candidateId: string;
  try {
    candidateId = await findOrCreateCandidateByEmail(workspaceId, result.email);
  } catch {
    return redirectTo("/portal/login?error=unavailable");
  }

  const ua = request.headers.get("user-agent") ?? undefined;
  await establishPortalSession(candidateId, workspaceId, ua);
  await auditPortalEvent({
    workspaceId,
    candidateId,
    email: result.email,
    action: "portal.login",
    metadata: { method: "magic_link" },
  });

  return redirectTo("/portal/dashboard");
}
