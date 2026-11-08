import "server-only";

import { NextResponse } from "next/server";

import { ApiError } from "@harly/api";

import { enforceRateLimit, rateLimitResultFromError } from "@/server/api/ratelimit";
import { getTrustedClientIp } from "@/server/security/policy";

/** Browser-based MCP clients (inspectors, web chat UIs) call these endpoints cross-origin. */
export const OAUTH_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string>; cache?: "no-store" | string } = {},
): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: {
      ...OAUTH_CORS_HEADERS,
      "Cache-Control": init.cache && init.cache !== "no-store" ? init.cache : NO_STORE["Cache-Control"],
      ...(init.cache && init.cache !== "no-store" ? {} : { Pragma: NO_STORE.Pragma }),
      ...init.headers,
    },
  });
}

export function oauthError(
  error: string,
  description: string,
  status = 400,
  headers: Record<string, string> = {},
): NextResponse {
  return jsonResponse({ error, error_description: description }, { status, headers });
}

/**
 * Per-IP fixed-window limit. Returns a 429 response to send, or null to proceed.
 * Unknown IPs share one bucket on purpose: no spoofable header buys more quota.
 */
export async function limitByIp(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
  asJson = true,
): Promise<NextResponse | null> {
  const ip = getTrustedClientIp(request) ?? "unknown";
  try {
    await enforceRateLimit(`mcp-oauth:${bucket}:${ip}`, { limit, windowMs });
    return null;
  } catch (error) {
    const result = rateLimitResultFromError(error);
    if (!(error instanceof ApiError) || !result) throw error;
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    return asJson
      ? oauthError("temporarily_unavailable", "Too many requests. Try again shortly.", 429, {
          "Retry-After": String(retryAfter),
        })
      : new NextResponse("Too many requests. Try again shortly.", {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        });
  }
}

/** application/x-www-form-urlencoded (spec) or JSON (lenient) request body. */
export async function readOAuthBody(request: Request): Promise<Record<string, string> | null> {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = (await request.json()) as unknown;
      if (!json || typeof json !== "object" || Array.isArray(json)) return null;
      return Object.fromEntries(
        Object.entries(json as Record<string, unknown>).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>;
    }
    const text = await request.text();
    if (text.length > 16 * 1024) return null;
    return Object.fromEntries(new URLSearchParams(text));
  } catch {
    return null;
  }
}
