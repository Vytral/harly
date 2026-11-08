import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { CandidatePortalCard } from "@/features/workspaces/CandidatePortalCard";
import {
  getPortalAuthRequirements,
  getStoredPortalAuthConfig,
} from "@/lib/portal-auth-methods";
import { getWorkspaceEmailStatus } from "@/lib/email/config";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

export default async function PortalSettingsPage() {
  await requirePagePermission("settings:edit");
  const { organization, role } = await getWorkspaceContext();
  const canEdit = role === "owner" || role === "admin";

  const [[row], emailStatus, authConfig, authRequirements] = await Promise.all([
    db
      .select({
        candidatePortalEnabled: workspaceSettings.candidatePortalEnabled,
        hasGoogleClientId: workspaceSettings.portalGoogleClientId,
        hasGoogleSecret: workspaceSettings.portalGoogleClientSecretCiphertext,
        hasGithubClientId: workspaceSettings.portalGithubClientId,
        hasGithubSecret: workspaceSettings.portalGithubClientSecretCiphertext,
        hasLinkedinClientId: workspaceSettings.portalLinkedinClientId,
        hasLinkedinSecret: workspaceSettings.portalLinkedinClientSecretCiphertext,
        portalShowApplicationStatus:
          workspaceSettings.portalShowApplicationStatus,
        portalShowHiringTeam: workspaceSettings.portalShowHiringTeam,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, organization.id))
      .limit(1),
    getWorkspaceEmailStatus(organization.id),
    getStoredPortalAuthConfig(organization.id),
    getPortalAuthRequirements(organization.id),
  ]);

  return (
    <CandidatePortalCard
      authConfig={authConfig}
      authRequirements={authRequirements}
      enabled={row?.candidatePortalEnabled ?? false}
      emailEnabled={emailStatus.enabled}
      canEdit={canEdit}
      googleConfigured={Boolean(row?.hasGoogleClientId && row?.hasGoogleSecret)}
      googleClientId={row?.hasGoogleClientId ?? ""}
      githubConfigured={Boolean(row?.hasGithubClientId && row?.hasGithubSecret)}
      githubClientId={row?.hasGithubClientId ?? ""}
      linkedinConfigured={Boolean(
        row?.hasLinkedinClientId && row?.hasLinkedinSecret,
      )}
      linkedinClientId={row?.hasLinkedinClientId ?? ""}
      appUrl={getHarlyPublicOrigin()}
      showApplicationStatus={row?.portalShowApplicationStatus ?? true}
      showHiringTeam={row?.portalShowHiringTeam ?? false}
    />
  );
}
