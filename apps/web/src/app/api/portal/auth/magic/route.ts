import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import type { Route } from "next";

import {
  consumeMagicLinkToken,
  findOrCreateCandidateByEmail,
  isPortalEnabled,
} from "@/lib/portal-auth";
import { auditPortalEvent } from "@/lib/portal-credentials";
import { establishPortalSession } from "@/lib/portal-session";
import { getPortalAuthMethods } from "@/lib/portal-auth-methods";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) redirect("/portal/login?error=missing_token" as Route);

  const result = await consumeMagicLinkToken(token!);
  if (!result) redirect("/portal/login?error=invalid_token" as Route);

  const workspaceId = result!.workspaceId;
  if (!(await isPortalEnabled(workspaceId))) {
    redirect("/portal/login?error=no_workspace" as Route);
  }

  if (!(await getPortalAuthMethods(workspaceId)).magicLink) {
    redirect("/portal/login?error=method_disabled" as Route);
  }

  let candidateId: string;
  try {
    candidateId = await findOrCreateCandidateByEmail(
      workspaceId,
      result!.email,
    );
  } catch {
    redirect("/portal/login?error=unavailable" as Route);
  }

  const ua = request.headers.get("user-agent") ?? undefined;
  await establishPortalSession(candidateId, workspaceId, ua);
  await auditPortalEvent({
    workspaceId,
    candidateId,
    email: result!.email,
    action: "portal.login",
    metadata: { method: "magic_link" },
  });

  redirect("/portal/dashboard" as Route);
}
