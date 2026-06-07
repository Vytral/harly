import { NextResponse, type NextRequest } from "next/server";

import { getSessionCookie } from "@openhire/auth/cookies";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/setup",
  "/api/auth",
  // Inbound integration webhooks authenticate via signature, not session.
  "/api/webhooks",
  "/api/applications/resume/presign",
  "/api/storage/presign",
  "/api/storage/upload",
  "/jobs",
  "/apply",
  "/board",
  "/invite",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (isPublic) {
    return NextResponse.next();
  }

  const session = getSessionCookie(request);

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
