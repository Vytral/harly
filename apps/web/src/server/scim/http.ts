import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit, clientIp } from "@/server/api/ratelimit";
import { resolveScimToken } from "@/server/scim/service";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export async function authenticateScimRequest(request: NextRequest, workspaceId: string) {
  try {
    await enforceRateLimit(`scim:${workspaceId}:${clientIp(request)}`, { limit: 120, windowMs: 60_000 });
  } catch {
    return { ok: false as const, response: scimError("Too many requests.", 429) };
  }
  const token = await resolveScimToken(request.headers.get("authorization"), workspaceId);
  if (!token) return { ok: false as const, response: scimError("Invalid SCIM credentials.", 401) };
  return { ok: true as const, token };
}

export function scimJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Content-Type": "application/scim+json", "Cache-Control": "no-store" } });
}

export function scimError(detail: string, status: number, scimType?: string) {
  return scimJson({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: String(status), detail, ...(scimType ? { scimType } : {}) }, status);
}

export function publicBaseUrl(request: NextRequest) {
  const configuredOrigin =
    process.env.HARLY_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL;
  return configuredOrigin ? getHarlyPublicOrigin() : request.nextUrl.origin;
}

export function scimBaseUrl(request: NextRequest, workspaceId: string) {
  return `${publicBaseUrl(request)}/api/scim/v2.0/${workspaceId}`;
}
