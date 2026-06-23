import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@harly/auth";
import { getSessionCookie } from "@harly/auth/cookies";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/setup",
  "/api/auth",
  // Inbound integration webhooks authenticate via signature, not session.
  "/api/webhooks",
  // Public REST API + authenticated REST API: both authenticate per-request
  // (slug / API key / cron secret), never via the session cookie.
  "/api/public",
  "/api/v1",
  "/api/cron",
  "/embed",
  "/api/applications/resume/presign",
  "/api/storage/presign",
  "/api/storage/upload",
  "/jobs",
  "/apply",
  "/board",
  "/invite",
];

const PROTECTED_PATH_PREFIXES = ["/dashboard", "/settings"];
const ACCOUNT_PATH = "/account";
const SECURITY_EXEMPT_PREFIXES = ["/settings/security", "/api"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

function isSecurityExempt(pathname: string): boolean {
  return SECURITY_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (isPublic) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 2FA + org enforcement for protected paths
  if (isProtected(pathname) && !isSecurityExempt(pathname)) {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      const loginUrl = new URL("/", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (pathname !== ACCOUNT_PATH) {
      try {
        const { db, workspaceSettings } = await import("@harly/db");
        const { eq } = await import("drizzle-orm");

        const orgId = (session.user as Record<string, unknown>).organizationId as string | undefined;
        if (orgId) {
          const [wsRow] = await db
            .select({ require2fa: workspaceSettings.require2fa })
            .from(workspaceSettings)
            .where(eq(workspaceSettings.organizationId, orgId))
            .limit(1);

          if (wsRow?.require2fa && !session.user.twoFactorEnabled) {
            return NextResponse.redirect(new URL(ACCOUNT_PATH, request.url));
          }
        }
      } catch {
        // DB query failure (e.g. edge runtime) — allow through, server-side enforces as fallback.
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
