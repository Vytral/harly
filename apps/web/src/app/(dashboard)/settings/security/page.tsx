import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAuditLogs, getWorkspaceSecuritySettings } from "@/features/security/data";
import { getOAuthProviderStatus, listOAuthProvidersAction } from "@/features/security/actions";
import { listSSOProvidersAction } from "@/features/security/sso-actions";
import { SsoCard } from "@/features/security/SsoCard";
import { AuditLogsCard } from "@/features/security/AuditLogsCard";
import { Force2FACard } from "@/features/security/Force2FACard";
import { ScimProvisioningCard } from "@/features/security/ScimProvisioningCard";
import { listScimTokensAction } from "@/features/security/scim-actions";
import { AdvancedSecurityCard } from "@/features/security/AdvancedSecurityCard";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  await requirePagePermission("security:manage");
  const { organization, roleKey } = await getWorkspaceContext();

  const [securitySettings, auditLogRows, providerStatus, existingConfigs, ssoProviders, scimTokens] =
    await Promise.all([
      getWorkspaceSecuritySettings(organization.id),
      getWorkspaceAuditLogs(organization.id),
      getOAuthProviderStatus(),
      listOAuthProvidersAction(),
      listSSOProvidersAction(),
      listScimTokensAction(),
    ]);

  const isOwner = roleKey === "owner";

  return (
    <div className="space-y-6">
      <Force2FACard enabled={securitySettings.require2fa} isOwner={isOwner} />
      <AdvancedSecurityCard settings={securitySettings} isOwner={isOwner} />
      <SsoCard
        providerConfigs={providerStatus}
        existingConfigs={existingConfigs}
        ssoProviders={ssoProviders}
      />
      <ScimProvisioningCard tokens={scimTokens} workspaceId={organization.id} isOwner={roleKey === "owner"} />
      <AuditLogsCard
        logs={auditLogRows}
        canExport={roleKey === "owner" || roleKey === "admin"}
      />
    </div>
  );
}
