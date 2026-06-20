import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAuditLogs, getWorkspaceSecuritySettings } from "@/features/security/data";
import { SsoCard } from "@/features/security/SsoCard";
import { AuditLogsCard } from "@/features/security/AuditLogsCard";
import { Force2FACard } from "@/features/security/Force2FACard";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  await requirePagePermission("members:manage");
  const { organization, roleKey } = await getWorkspaceContext();

  const [securitySettings, auditLogRows] = await Promise.all([
    getWorkspaceSecuritySettings(organization.id),
    getWorkspaceAuditLogs(organization.id),
  ]);

  const microsoftConfigured = !!process.env.MICROSOFT_CLIENT_ID;
  const githubConfigured = !!process.env.GITHUB_CLIENT_ID;
  const googleConfigured = !!process.env.GOOGLE_CLIENT_ID;

  const isOwner = roleKey === "owner";

  return (
    <div className="space-y-6">
      <Force2FACard enabled={securitySettings.require2fa} isOwner={isOwner} />
      <SsoCard
        googleConfigured={googleConfigured}
        microsoftConfigured={microsoftConfigured}
        githubConfigured={githubConfigured}
      />
      <AuditLogsCard logs={auditLogRows} />
    </div>
  );
}
