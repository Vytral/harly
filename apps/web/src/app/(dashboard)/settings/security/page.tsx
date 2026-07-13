import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAuditLogs, getWorkspaceSecuritySettings } from "@/features/security/data";
import { getOAuthProviderStatus, listOAuthProvidersAction } from "@/features/security/actions";
import { listSSOProvidersAction } from "@/features/security/sso-actions";
import { SsoCard } from "@/features/security/SsoCard";
import { AuditLogsCard } from "@/features/security/AuditLogsCard";
import { Force2FACard } from "@/features/security/Force2FACard";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  await requirePagePermission("security:manage");
  const { organization, roleKey } = await getWorkspaceContext();

  const [securitySettings, auditLogRows, providerStatus, existingConfigs, ssoProviders] =
    await Promise.all([
      getWorkspaceSecuritySettings(organization.id),
      getWorkspaceAuditLogs(organization.id),
      getOAuthProviderStatus(),
      listOAuthProvidersAction(),
      listSSOProvidersAction(),
    ]);

  const isOwner = roleKey === "owner";

  return (
    <div className="space-y-6">
      <Force2FACard enabled={securitySettings.require2fa} isOwner={isOwner} />
      <SsoCard
        providerConfigs={providerStatus}
        existingConfigs={existingConfigs}
        ssoProviders={ssoProviders}
      />
      <AuditLogsCard logs={auditLogRows} />
    </div>
  );
}
