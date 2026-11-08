import { headers } from "next/headers";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import {
  approveAuthorization,
  deniedRedirectUrl,
  failureRedirectUrl,
  recordConsentDenied,
  validateAuthorizeRequest,
} from "@/lib/mcp/oauth/authorize";
import { evaluateConsentGate } from "@/lib/mcp/oauth/consent";
import { limitByIp } from "@/lib/mcp/oauth/http";
import { getHarlyPublicOrigin, toHarlyPublicUrl } from "@/lib/public-origin";

// Receives the consent form. A plain POST + 303 (not a server action) because the
// destination can be a native app scheme or a loopback URL, which a client-side
// router navigation would not follow.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(location: string) {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}

function backToConsent(params: URLSearchParams, extra: Record<string, string> = {}) {
  const url = new URL(toHarlyPublicUrl("/oauth/consent"));
  for (const [key, value] of params) url.searchParams.set(key, value);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return redirectTo(url.toString());
}

export async function POST(request: Request) {
  // CSRF: the session cookie is SameSite=Lax, but also insist on same-origin.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== getHarlyPublicOrigin()) {
    return new Response("Cross-origin request refused.", { status: 403 });
  }
  const limited = await limitByIp(request, "consent", 30, 60 * 1000, false);
  if (limited) return limited;

  const form = await request.formData();
  const decision = form.get("decision");
  const query = form.get("request");
  if ((decision !== "approve" && decision !== "deny") || typeof query !== "string" || query.length > 8192) {
    return new Response("Bad request.", { status: 400 });
  }
  const params = new URLSearchParams(query);

  const validation = await validateAuthorizeRequest(params);
  if (!validation.ok) {
    if (validation.kind === "redirect") return redirectTo(failureRedirectUrl(validation));
    return backToConsent(new URLSearchParams(), {
      request_error: validation.error,
      request_error_reason: validation.reason,
    });
  }

  const ctx = await getWorkspaceContextOrNull();
  if (!ctx) {
    const login = new URL(toHarlyPublicUrl("/login"));
    login.searchParams.set("redirect", `/oauth/authorize?${params.toString()}`);
    return redirectTo(login.toString());
  }

  // Approve only the workspace the consent page named. Another tab may have
  // switched the session's active workspace since the page was rendered.
  const shownWorkspace = form.get("workspace");
  if (decision === "approve" && shownWorkspace !== ctx.organization.id) {
    return backToConsent(params);
  }

  const requestHeaders = await headers();
  const gate = await evaluateConsentGate(ctx, validation.request, requestHeaders);

  if (decision === "deny") {
    await recordConsentDenied({
      request: validation.request,
      workspaceId: ctx.organization.id,
      userId: ctx.user.id,
      ip: gate.ok ? gate.ip : undefined,
    });
    return redirectTo(deniedRedirectUrl(validation.request));
  }

  if (!gate.ok) {
    await recordConsentDenied({
      request: validation.request,
      workspaceId: ctx.organization.id,
      userId: ctx.user.id,
      reason: gate.block.reason,
    });
    // The consent page renders the explanation for the same request.
    return backToConsent(params);
  }

  const location = await approveAuthorization({
    request: validation.request,
    grantedScopes: gate.grantedScopes,
    workspaceId: ctx.organization.id,
    userId: ctx.user.id,
    ip: gate.ip,
  });
  return redirectTo(location);
}
