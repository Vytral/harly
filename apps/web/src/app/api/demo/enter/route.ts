import { NextResponse, type NextRequest } from "next/server";

import { isDemoMode, loadHarlyConfig } from "@harly/config";

import { auth } from "@/lib/auth";
import { createDemoSandbox, SandboxCapacityError } from "@/features/demo/sandbox";
import { parseDemoStyle } from "@/features/demo/sandbox-styles";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { createLogger } from "@/lib/logger";
import { signSessionCookieValue } from "@/lib/session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Minting a sandbox seeds a full workspace, which takes a few seconds.
export const maxDuration = 60;

const log = createLogger("demo-enter");

function publicUrl(path: string): URL {
  return new URL(path, loadHarlyConfig().publicUrl);
}

/**
 * Public demo entry. Only mounted when DEMO_MODE=true. Verifies a Cloudflare
 * Turnstile token, rate-limits by IP, then provisions a private sandbox
 * workspace for the visitor (seeded in the style they previewed), signs them in
 * to it server-side and redirects to the dashboard.
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
    // Each entry seeds a whole workspace, so keep this much tighter than a
    // plain sign-in: a burst limit plus an hourly ceiling per IP.
    await enforceRateLimit(`demo:enter:${ip}`, { limit: 3, windowMs: 60_000 });
    await enforceRateLimit(`demo:enter:hour:${ip}`, { limit: 12, windowMs: 3_600_000 });
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
    const url = publicUrl("/enter");
    url.searchParams.set("error", "captcha");
    return NextResponse.redirect(url, { status: 303 });
  }

  // Every visitor gets a private sandbox: their own account and their own copy
  // of the Syntrix workspace, in the career-page style they previewed. The
  // shared template workspace is never signed into, so nothing a visitor does
  // can reach another visitor.
  const style = parseDemoStyle(form?.get("style"));
  let sandbox: Awaited<ReturnType<typeof createDemoSandbox>>;
  try {
    sandbox = await createDemoSandbox({ style });
  } catch (error) {
    if (error instanceof SandboxCapacityError) {
      const url = publicUrl("/enter");
      url.searchParams.set("error", "capacity");
      url.searchParams.set("style", style);
      return NextResponse.redirect(url, { status: 303 });
    }
    log.error({ error }, "Could not create the demo sandbox");
    return NextResponse.json({ error: "Could not start the demo." }, { status: 503 });
  }

  // Sign in server-side via better-auth's internal adapter (there is no
  // password; the sandbox account only exists to hold this one session).
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(sandbox.userId);
  if (!session) {
    return NextResponse.json({ error: "Could not start the demo session." }, { status: 500 });
  }
  await ctx.internalAdapter.updateSession(session.token, {
    activeOrganizationId: sandbox.workspaceId,
  });

  const response = NextResponse.redirect(publicUrl("/dashboard"), { status: 303 });

  const cookieName = ctx.authCookies.sessionToken.name;
  const cookieAttributes = ctx.authCookies.sessionToken.attributes;
  // better-auth stores the session token as a SIGNED cookie; setting the raw
  // token would make getSession reject it. Sign it the same way here.
  const signedValue = signSessionCookieValue(session.token, ctx.secret);
  response.cookies.set(cookieName, signedValue, {
    // The session never outlives the sandbox it points at.
    maxAge: Math.min(
      ctx.sessionConfig.expiresIn,
      Math.max(60, Math.floor((sandbox.expiresAt.getTime() - Date.now()) / 1000)),
    ),
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
