import { createHash } from "node:crypto";

import { toNextJsHandler } from "@harly/auth/next";
import { ApiError } from "@harly/api";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  clientIp,
  enforcePersistentRateLimit,
  enforceRateLimit,
} from "@/server/api/ratelimit";

const handlers = toNextJsHandler(auth);

const TOO_MANY_AUTH_REQUESTS =
  "Too many authentication requests. Please try again later.";

/**
 * Per-recipient budget for password-reset requests. It counts every address the
 * same way whether or not an account exists, and better-auth answers unknown
 * addresses with the same body as known ones, so a throttled response leaks
 * nothing about accounts. The Postgres-backed store keeps the budget across
 * restarts and instances.
 */
const PASSWORD_RESET_RECIPIENT_LIMIT = { limit: 5, windowMs: 15 * 60_000 };
const PASSWORD_RESET_PATHS = ["/request-password-reset", "/forget-password"];

function passwordResetRecipientKey(email: string) {
  const normalized = email.trim().toLowerCase();
  // Hash the address so the rate-limit table never stores it in plain text.
  const digest = createHash("sha256").update(normalized).digest("hex");
  return `auth:password-reset:recipient:${digest}`;
}

async function passwordResetRecipientThrottled(request: Request) {
  if (request.method !== "POST") return false;
  const { pathname } = new URL(request.url);
  if (!PASSWORD_RESET_PATHS.some((path) => pathname.endsWith(path))) return false;

  let body: unknown;
  try {
    // Clone so the handler can still read the original body.
    body = await request.clone().json();
  } catch {
    return false;
  }
  const email =
    body && typeof body === "object" && "email" in body && typeof body.email === "string"
      ? body.email
      : null;
  if (!email) return false;

  try {
    await enforcePersistentRateLimit(
      passwordResetRecipientKey(email),
      PASSWORD_RESET_RECIPIENT_LIMIT,
    );
    return false;
  } catch (error) {
    if (error instanceof ApiError && error.code === "rate_limited") return true;
    throw error;
  }
}

async function rateLimitedAuth(
  request: Request,
  handler: (request: Request) => Promise<Response>,
) {
  try {
    await enforceRateLimit(`public:auth:${clientIp(request)}`, {
      limit: 60,
      windowMs: 60_000,
    });
  } catch {
    return NextResponse.json({ error: TOO_MANY_AUTH_REQUESTS }, { status: 429 });
  }
  if (await passwordResetRecipientThrottled(request)) {
    return NextResponse.json({ error: TOO_MANY_AUTH_REQUESTS }, { status: 429 });
  }
  return handler(request);
}

export const GET = (request: Request) => rateLimitedAuth(request, handlers.GET);
export const POST = (request: Request) => rateLimitedAuth(request, handlers.POST);
