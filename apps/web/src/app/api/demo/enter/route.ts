import { NextResponse, type NextRequest } from "next/server";

import { demoLoginEmail, demoWorkspaceId, isDemoMode } from "@harly/config";
import { db, member, user as userTable } from "@harly/db";
import { eq, sql as dsql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { createLogger } from "@/lib/logger";
import { signSessionCookieValue } from "@/lib/session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("demo-enter");

/**
 * Public demo entry. Only mounted when DEMO_MODE=true. Verifies a Cloudflare
 * Turnstile token, rate-limits by IP, then signs the visitor in as the shared
 * demo account (server-side — the password is never involved) and points the
 * session at the single Syntrix workspace before redirecting to the dashboard.
 */
async function verifyTurnstile(token: string | null, remoteIp: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // Config validation guarantees the secret exists in demo mode; treat a
  // missing secret as a hard fail rather than silently letting bots through.
  if (!secret) return false;
  if (!token) return false;

  const params: Record<string, string> = { secret, response: token };
  if (remoteIp) params.remoteip = remoteIp;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (error) {
    log.warn({ error }, "Turnstile verification request failed");
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isDemoMode()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const ip = clientIp(request);
  try {
    await enforceRateLimit(`demo:enter:${ip}`, { limit: 10, windowMs: 60_000 });
  } catch {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in a minute." },
      { status: 429 },
    );
  }

  // Token arrives as the Turnstile hidden field on a normal form submit.
  const form = await request.formData().catch(() => null);
  const token =
    (form?.get("cf-turnstile-response") as string | null) ??
    (form?.get("turnstileToken") as string | null) ??
    null;

  const passed = await verifyTurnstile(token, ip);
  if (!passed) {
    const url = new URL("/enter", request.url);
    url.searchParams.set("error", "captcha");
    return NextResponse.redirect(url, { status: 303 });
  }

  // Resolve the shared demo user (case-insensitive on email).
  const email = demoLoginEmail();
  const [account] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(dsql`lower(${userTable.email})`, email))
    .limit(1);
  if (!account) {
    log.error({ email }, "Demo login user not found");
    return NextResponse.json({ error: "Demo is not configured." }, { status: 503 });
  }

  // Sign in server-side via better-auth's internal adapter (no password round
  // trip — the shown credentials are informational only).
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(account.id);
  if (!session) {
    return NextResponse.json({ error: "Could not start the demo session." }, { status: 500 });
  }

  // Point the session at the single workspace this account owns/belongs to, so
  // the dashboard resolves a workspace immediately. When DEMO_WORKSPACE_ID is
  // set, refuse membership matches (same pin as demo-reset) so enter cannot
  // activate a different org if the shared account were multi-homed.
  const [membership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, account.id))
    .limit(1);
  if (!membership) {
    log.error({ email }, "Demo workspace membership not found");
    return NextResponse.json({ error: "Demo is not configured." }, { status: 503 });
  }

  const pinned = demoWorkspaceId();
  if (pinned && pinned !== membership.organizationId) {
    log.error(
      { email, pinned, actual: membership.organizationId },
      "demo-enter: workspace id does not match DEMO_WORKSPACE_ID",
    );
    return NextResponse.json({ error: "Demo is not configured." }, { status: 503 });
  }

  await ctx.internalAdapter.updateSession(session.token, {
    activeOrganizationId: membership.organizationId,
  });

  const response = NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });

  const cookieName = ctx.authCookies.sessionToken.name;
  const cookieAttributes = ctx.authCookies.sessionToken.attributes;
  // better-auth stores the session token as a SIGNED cookie; setting the raw
  // token would make getSession reject it. Sign it the same way here.
  const signedValue = signSessionCookieValue(session.token, ctx.secret);
  response.cookies.set(cookieName, signedValue, {
    maxAge: ctx.sessionConfig.expiresIn,
    path: cookieAttributes.path || "/",
    httpOnly:
      ((cookieAttributes as Record<string, unknown>).httponly as boolean) ||
      cookieAttributes.httpOnly,
    secure: cookieAttributes.secure,
    sameSite:
      ((cookieAttributes as Record<string, unknown>).samesite as "lax" | "strict" | "none") ||
      "lax",
  });

  return response;
}
