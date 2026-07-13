import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@harly/auth";
import { getSessionCookie } from "@harly/auth/cookies";

import { mustSetUp2fa } from "@/lib/two-factor";

const PORTAL_SESSION_COOKIE = "harly_portal_session";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/setup",
  "/api/auth",
  "/api/webhooks",
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
  // Portal public routes — pages enforce isPortalEnabled themselves
  "/portal",
  "/api/portal",
  "/setup-2fa",
];

const PROTECTED_PATH_PREFIXES = ["/dashboard", "/settings"];
const SECURITY_EXEMPT_PREFIXES = ["/settings/security", "/account", "/api"];

// Portal protected paths — require portal session cookie (no DB needed)
const PORTAL_PROTECTED = ["/portal/dashboard", "/portal/jobs", "/portal/profile", "/portal/notifications"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

function isSecurityExempt(pathname: string): boolean {
  return SECURITY_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

function isPortalProtected(pathname: string): boolean {
  return PORTAL_PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Candidate portal protected routes (cookie-only, no DB) ──────────────
  if (isPortalProtected(pathname)) {
    const token = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
    if (!token) {
      const loginUrl = new URL("/portal/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }
  // ────────────────────────────────────────────────────────────────────────

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
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    try {
      const { db, workspaceSettings } = await import("@harly/db");
      const { and, eq } = await import("drizzle-orm");

      const { member: authMembers, user: userTable } = await import("@harly/db");

      // Resolve org: activeOrganizationId → first membership (same as workspace/context.ts)
      const activeOrgId = (session.session as Record<string, unknown>).activeOrganizationId as string | undefined;
      let orgId = activeOrgId;
      if (!orgId) {
        const [firstMember] = await db
          .select({ orgId: authMembers.organizationId })
          .from(authMembers)
          .where(eq(authMembers.userId, session.user.id))
          .limit(1);
        orgId = firstMember?.orgId;
      }

      if (orgId) {
        const [[wsRow], [memberRow], [userRow]] = await Promise.all([
          db
            .select({ require2fa: workspaceSettings.require2fa })
            .from(workspaceSettings)
            .where(eq(workspaceSettings.organizationId, orgId))
            .limit(1),
          db
            .select({ role: authMembers.role })
            .from(authMembers)
            .where(
              and(
                eq(authMembers.userId, session.user.id),
                eq(authMembers.organizationId, orgId),
              ),
            )
            .limit(1),
          db
            .select({ twoFactorEnabled: userTable.twoFactorEnabled })
            .from(userTable)
            .where(eq(userTable.id, session.user.id))
            .limit(1),
        ]);

        if (
          mustSetUp2fa({
            workspaceRequires2fa: wsRow?.require2fa ?? false,
            userHas2fa: userRow?.twoFactorEnabled ?? false,
            roleKey: memberRow?.role,
          })
        ) {
          return NextResponse.redirect(new URL("/setup-2fa", request.url));
        }
      }
    } catch {
      // DB query failure — allow through, server-side enforces as fallback.
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
