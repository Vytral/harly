import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";
import type { Route } from "next";

import {
  PORTAL_SESSION_COOKIE,
  consumeMagicLinkToken,
  createPortalSession,
  findOrCreateCandidateByEmail,
  getPortalWorkspaceId,
  isPortalEnabled,
} from "@/lib/portal-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isPortalEnabled())) {
    return NextResponse.json({ error: "Portal not enabled." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) redirect("/portal/login?error=missing_token" as Route);

  const result = await consumeMagicLinkToken(token!);
  if (!result) redirect("/portal/login?error=invalid_token" as Route);

  const workspaceId = await getPortalWorkspaceId();
  if (!workspaceId) redirect("/portal/login?error=no_workspace" as Route);

  const candidateId = await findOrCreateCandidateByEmail(
    workspaceId!,
    result!.email,
  );

  const ua = request.headers.get("user-agent") ?? undefined;
  const raw = await createPortalSession(candidateId, workspaceId!, ua);

  const cookieStore = await cookies();
  cookieStore.set(PORTAL_SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/portal/dashboard" as Route);
}
