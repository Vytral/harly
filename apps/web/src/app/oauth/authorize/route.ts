import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { failureRedirectUrl, validateAuthorizeRequest } from "@/lib/mcp/oauth/authorize";
import { limitByIp } from "@/lib/mcp/oauth/http";
import { toHarlyPublicUrl } from "@/lib/public-origin";

// Authorization endpoint. Validates the request, sends anonymous browsers
// through the normal Harly sign-in, then hands over to the consent page.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function consentUrl(params: URLSearchParams): string {
  return `${toHarlyPublicUrl("/oauth/consent")}?${params.toString()}`;
}

function errorPage(error: string, description: string): NextResponse {
  const url = new URL(toHarlyPublicUrl("/oauth/consent"));
  url.searchParams.set("request_error", error);
  url.searchParams.set("request_error_description", description);
  return NextResponse.redirect(url, 303);
}

export async function GET(request: Request) {
  const limited = await limitByIp(request, "authorize", 60, 60 * 1000, false);
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const validation = await validateAuthorizeRequest(params);
  if (!validation.ok) {
    if (validation.kind === "page") return errorPage(validation.error, validation.description);
    return NextResponse.redirect(failureRedirectUrl(validation), 303);
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    const back = `/oauth/authorize?${params.toString()}`;
    const login = new URL(toHarlyPublicUrl("/login"));
    login.searchParams.set("redirect", back);
    return NextResponse.redirect(login, 303);
  }
  return NextResponse.redirect(consentUrl(params), 303);
}
