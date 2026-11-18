"use server";

import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { isDemoMode } from "@harly/config";
import { candidates, db, documentRequests, organization, workspaceSettings } from "@harly/db";

import { getTranslations } from "@/i18n/server";
import { requireCandidatePermission, requirePermission } from "@/features/workspaces/permissions-server";
import { auditPortalEvent } from "@/lib/portal-credentials";
import { establishPortalSession } from "@/lib/portal-session";

import { isLiveSandboxWorkspace } from "./sandbox-state";

export type OpenDemoCandidatePortalResult =
  | { ok: true; url: string }
  | { ok: false; error: string; enterDemo?: boolean };

/**
 * Public demo only: sign the visitor into the candidate portal as one of the
 * candidates seeded into their own sandbox, so they can see what a candidate
 * sees without an email address or a login.
 *
 * Every condition is decided on the server:
 * - DEMO_MODE must be on (self-hosted installs always refuse),
 * - the caller's active workspace must be a live per-visitor sandbox (never the
 *   shared template),
 * - the caller must be allowed to view the candidate (workspace and role scope),
 * - the candidate must belong to that sandbox and be part of the seeded dataset
 *   (created before the sandbox itself), not someone the visitor added.
 */
export async function openDemoCandidatePortalAction(input: {
  candidateId: string;
}): Promise<OpenDemoCandidatePortalResult> {
  const t = await getTranslations("server.demo.candidatePortal");
  if (!isDemoMode()) return { ok: false, error: t("unavailable") };

  const parsed = z.object({ candidateId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("unavailable") };
  const { candidateId } = parsed.data;

  let context: Awaited<ReturnType<typeof requireCandidatePermission>>;
  try {
    context = await requireCandidatePermission("candidates:view", candidateId);
  } catch {
    return { ok: false, error: t("unavailable") };
  }
  const workspaceId = context.organization.id;
  if (!(await isLiveSandboxWorkspace(workspaceId))) {
    return { ok: false, error: t("unavailable") };
  }

  const [row] = await db
    .select({ id: candidates.id, portalEnabled: workspaceSettings.candidatePortalEnabled })
    .from(candidates)
    .innerJoin(organization, eq(organization.id, candidates.workspaceId))
    .innerJoin(workspaceSettings, eq(workspaceSettings.organizationId, candidates.workspaceId))
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
        // Seeded candidates are back-dated before the sandbox was minted;
        // anything the visitor created afterwards is not eligible.
        lt(candidates.createdAt, organization.createdAt),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, error: t("seededOnly") };
  if (!row.portalEnabled) return { ok: false, error: t("portalOff") };

  const userAgent = (await headers()).get("user-agent") ?? undefined;
  await establishPortalSession(candidateId, workspaceId, userAgent);
  await auditPortalEvent({
    workspaceId,
    candidateId,
    actorId: context.user.id,
    email: context.user.email,
    action: "portal.demo_preview_opened",
  });

  return { ok: true, url: "/portal/dashboard" };
}

/**
 * Public demo only, from the portal sign-in page: open the portal as the
 * sample candidate with the most to show (pending document requests first).
 * A visitor without a demo workspace yet is sent to the demo entry screen.
 * The candidate-level action re-checks every condition.
 */
export async function openDemoPortalAsSampleCandidateAction(): Promise<OpenDemoCandidatePortalResult> {
  const t = await getTranslations("server.demo.candidatePortal");
  if (!isDemoMode()) return { ok: false, error: t("unavailable") };

  let workspaceId: string;
  try {
    workspaceId = (await requirePermission("candidates:view")).organization.id;
  } catch {
    return { ok: false, error: t("unavailable"), enterDemo: true };
  }
  if (!(await isLiveSandboxWorkspace(workspaceId))) {
    return { ok: false, error: t("unavailable"), enterDemo: true };
  }

  const pending = sql<number>`count(${documentRequests.id}) filter (where ${documentRequests.status} = 'pending')`;
  const [pick] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .innerJoin(organization, eq(organization.id, candidates.workspaceId))
    .leftJoin(documentRequests, eq(documentRequests.candidateId, candidates.id))
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
        lt(candidates.createdAt, organization.createdAt),
      ),
    )
    .groupBy(candidates.id, candidates.createdAt)
    .orderBy(desc(pending), asc(candidates.createdAt))
    .limit(1);
  if (!pick) return { ok: false, error: t("seededOnly") };

  return openDemoCandidatePortalAction({ candidateId: pick.id });
}
