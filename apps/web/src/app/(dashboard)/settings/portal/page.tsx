import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { CandidatePortalCard } from "@/features/workspaces/CandidatePortalCard";

export const dynamic = "force-dynamic";

export default async function PortalSettingsPage() {
  await requirePagePermission("settings:edit");
  const { organization, role } = await getWorkspaceContext();
  const canEdit = role === "owner" || role === "admin";

  const [row] = await db
    .select({
      candidatePortalEnabled: workspaceSettings.candidatePortalEnabled,
      hasGoogleClientId: workspaceSettings.portalGoogleClientId,
      hasGoogleSecret: workspaceSettings.portalGoogleClientSecretCiphertext,
      hasGithubClientId: workspaceSettings.portalGithubClientId,
      hasGithubSecret: workspaceSettings.portalGithubClientSecretCiphertext,
      portalShowApplicationStatus: workspaceSettings.portalShowApplicationStatus,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, organization.id))
    .limit(1);

  return (
    <CandidatePortalCard
      enabled={row?.candidatePortalEnabled ?? false}
      canEdit={canEdit}
      googleConfigured={Boolean(row?.hasGoogleClientId && row?.hasGoogleSecret)}
      googleClientId={row?.hasGoogleClientId ?? ""}
      githubConfigured={Boolean(row?.hasGithubClientId && row?.hasGithubSecret)}
      githubClientId={row?.hasGithubClientId ?? ""}
      showApplicationStatus={row?.portalShowApplicationStatus ?? true}
    />
  );
}
