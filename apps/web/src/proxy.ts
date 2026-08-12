import { NextResponse, type NextRequest } from "next/server";

import { getSessionCookie } from "@harly/auth/cookies";

import { mustSetUp2fa } from "@/lib/two-factor";
import { detectSuspiciousSession, getTrustedClientIp, isEmailDomainAllowed, isIpAllowed } from "@/server/security/policy";

const PORTAL_SESSION_COOKIE = "harly_portal_session";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/setup",
  "/api/auth",
  "/api/health",
  "/api/metrics",
  // SSE authenticates in the route so unauthenticated EventSource clients get
  // a 401 response instead of a redirect to an HTML login page.
  "/api/realtime",
  "/api/setup",
  "/api/webhooks",
  "/api/public",
  "/api/v1",
  // SCIM authenticates with its workspace-scoped bearer token in the route;
  // never redirect an IdP to the browser login page.
  "/api/scim",
  "/api/cron",
  "/embed",
  "/api/applications/resume/presign",
  "/api/storage/presign",
  "/api/storage/upload",
  "/jobs",
  "/apply",
  "/board",
  "/invite",
  // Portal public routes , pages enforce isPortalEnabled themselves
  "/portal",
  "/api/portal",
  "/setup-2fa",
  "/sign",
  "/api/native-sign",
];

const PROTECTED_PATH_PREFIXES = ["/dashboard", "/settings"];
const SECURITY_EXEMPT_PREFIXES = ["/settings/security", "/account", "/api"];
// Reachable while a forced password change is pending, so the member can
// actually complete it (and sign out) without bouncing back here.
const CHANGE_PASSWORD_EXEMPT = ["/change-password", "/api", "/setup-2fa"];

// Portal protected paths , require portal session cookie (no DB needed)
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

function publicRedirectUrl(request: NextRequest, pathname: string): URL {
  const configuredOrigin =
    process.env.HARLY_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL;
  return new URL(pathname, configuredOrigin ?? request.nextUrl.origin);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Candidate portal protected routes (cookie-only, no DB) ──────────────
  if (isPortalProtected(pathname)) {
    const token = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
    if (!token) {
      const loginUrl = publicRedirectUrl(request, "/portal/login");
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
    return NextResponse.redirect(publicRedirectUrl(request, "/login"));
  }

  // 2FA + org enforcement for protected paths
  if (isProtected(pathname) && !isSecurityExempt(pathname)) {
    const { auth } = await import("@harly/auth");
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      const loginUrl = publicRedirectUrl(request, "/login");
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    try {
      const { db, workspaceSettings } = await import("@harly/db");
      const { and, eq } = await import("drizzle-orm");

      const { member: authMembers, user: userTable, passkeys, session: authSessions } = await import("@harly/db");

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
        const [[wsRow], [memberRow], [userRow], [existingPasskey], [sessionMeta]] = await Promise.all([
          db
            .select({
              require2fa: workspaceSettings.require2fa,
              ipAllowlist: workspaceSettings.securityIpAllowlist,
              allowedDomains: workspaceSettings.securityAllowedDomains,
              requirePasskey: workspaceSettings.securityRequirePasskey,
              riskDetectionEnabled: workspaceSettings.securityRiskDetectionEnabled,
            })
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
            .select({
              twoFactorEnabled: userTable.twoFactorEnabled,
              mustChangePassword: userTable.mustChangePassword,
            })
            .from(userTable)
            .where(eq(userTable.id, session.user.id))
            .limit(1),
          db
            .select({ id: passkeys.id })
            .from(passkeys)
            .where(eq(passkeys.userId, session.user.id))
            .limit(1),
          db
            .select({ ipAddress: authSessions.ipAddress, userAgent: authSessions.userAgent })
            .from(authSessions)
            .where(eq(authSessions.id, session.session.id))
            .limit(1),
        ]);

        const requestIp = getTrustedClientIp(request);
        const ipAllowlist = Array.isArray(wsRow?.ipAllowlist) ? wsRow.ipAllowlist as string[] : [];
        if (!isIpAllowed(requestIp, ipAllowlist)) {
          return new NextResponse("Workspace access is restricted by IP policy.", { status: 403 });
        }
        const allowedDomains = Array.isArray(wsRow?.allowedDomains) ? wsRow.allowedDomains as string[] : [];
        if (!isEmailDomainAllowed(session.user.email, allowedDomains)) {
          return new NextResponse("Your email domain is not allowed for this workspace.", { status: 403 });
        }
        if (
          wsRow?.riskDetectionEnabled &&
          detectSuspiciousSession({
            previousIp: sessionMeta?.ipAddress,
            currentIp: requestIp,
            previousUserAgent: sessionMeta?.userAgent,
            currentUserAgent: request.headers.get("user-agent"),
          })
        ) {
          await db.delete(authSessions).where(eq(authSessions.id, session.session.id));
          return new NextResponse("Suspicious session activity detected. Please sign in again.", {
            status: 403,
            headers: { "x-harly-security-event": "reauthentication-required" },
          });
        }

        // A forced password change takes priority over the 2FA gate: the member
        // must replace the owner-set temporary password before anything else.
        if (
          userRow?.mustChangePassword &&
          !CHANGE_PASSWORD_EXEMPT.some((p) => pathname.startsWith(p))
        ) {
          return NextResponse.redirect(
            publicRedirectUrl(request, "/change-password"),
          );
        }

        // A passkey is a valid second factor too, not just TOTP.
        if (
          mustSetUp2fa({
            workspaceRequires2fa: wsRow?.require2fa ?? false,
            userHas2fa: Boolean(userRow?.twoFactorEnabled) || Boolean(existingPasskey),
            roleKey: memberRow?.role,
          })
        ) {
          return NextResponse.redirect(publicRedirectUrl(request, "/setup-2fa"));
        }

        if (wsRow?.requirePasskey && !existingPasskey) {
          return NextResponse.redirect(publicRedirectUrl(request, "/setup-2fa"));
        }
      }
    } catch {
      // DB query failure , allow through, server-side enforces as fallback.
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
