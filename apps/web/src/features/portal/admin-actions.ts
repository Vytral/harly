"use server";

import { getTranslations } from "@/i18n/server";
import { z } from "zod";

import { assertNotDemo } from "@/features/demo/assert-not-demo";
import { requireCandidatePermission } from "@/features/workspaces/permissions-server";
import { getPortalAuthMethods } from "@/lib/portal-auth-methods";
import { auditPortalEvent, issueOneTimeCode } from "@/lib/portal-credentials";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export type IssuePortalCodeResult =
  | { ok: true; url: string; code: string; expiresAt: string }
  | { ok: false; error: string };

/**
 * Recruiter issues a one-time link for a candidate: an access link (first
 * sign-in without email or password) or a password reset link. The raw value is
 * returned once to be copied and handed over through another channel; only its
 * hash is stored.
 */
export async function issueCandidatePortalCodeAction(input: {
  candidateId: string;
  kind: "access" | "reset";
}): Promise<IssuePortalCodeResult> {
  const t = await getTranslations("server.portal.admin");
  assertNotDemo();
  const parsed = z
    .object({ candidateId: z.string().uuid(), kind: z.enum(["access", "reset"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidRequest") };
  try {
    const context = await requireCandidatePermission(
      "candidates:edit",
      parsed.data.candidateId,
    );
    const workspaceId = context.organization.id;
    const methods = await getPortalAuthMethods(workspaceId);
    if (parsed.data.kind === "access" && !methods.accessCode) {
      return { ok: false, error: t("accessCodesOff") };
    }
    if (parsed.data.kind === "reset" && !methods.password) {
      return { ok: false, error: t("passwordSignInOff") };
    }
    const { code, expiresAt } = await issueOneTimeCode({
      candidateId: parsed.data.candidateId,
      workspaceId,
      kind: parsed.data.kind,
      createdBy: context.user.id,
    });
    await auditPortalEvent({
      workspaceId,
      candidateId: parsed.data.candidateId,
      actorId: context.user.id,
      email: context.user.email,
      action:
        parsed.data.kind === "access"
          ? "portal.access_code_issued"
          : "portal.reset_link_issued",
      severity: "warning",
    });
    const path = parsed.data.kind === "access" ? "access" : "reset";
    return {
      ok: true,
      code,
      url: `${getHarlyPublicOrigin()}/portal/${path}?code=${encodeURIComponent(code)}`,
      expiresAt: expiresAt.toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : t("issueFailed"),
    };
  }
}
