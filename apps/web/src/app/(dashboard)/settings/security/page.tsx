import { isDemoMode } from "@harly/config";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAuditLogs, getWorkspaceSecuritySettings } from "@/features/security/data";
import { getOAuthProviderStatus, listOAuthProvidersAction, getEnabledLoginMethodsAction } from "@/features/security/actions";
import { listSSOProvidersAction } from "@/features/security/sso-actions";
import { getConfiguredLoginMethods } from "@/features/auth/login-methods.server";
import { SsoCard } from "@/features/security/SsoCard";
import { LoginMethodsCard } from "@/features/security/LoginMethodsCard";
import { AuditLogsCard } from "@/features/security/AuditLogsCard";
import { Force2FACard } from "@/features/security/Force2FACard";
import { ScimProvisioningCard } from "@/features/security/ScimProvisioningCard";
import { listScimTokensAction } from "@/features/security/scim-actions";
import { DemoLockedNotice } from "@/features/demo/DemoLockedNotice";
import { AdvancedSecurityCard } from "@/features/security/AdvancedSecurityCard";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  await requirePagePermission("security:manage");
  const { organization, roleKey } = await getWorkspaceContext();

  const [securitySettings, auditLogRows, providerStatus, existingConfigs, ssoProviders, scimTokens, configuredLoginMethods, enabledLoginMethods] =
    await Promise.all([
      getWorkspaceSecuritySettings(organization.id),
      getWorkspaceAuditLogs(organization.id),
      getOAuthProviderStatus(),
      listOAuthProvidersAction(),
      listSSOProvidersAction(),
      listScimTokensAction(),
      getConfiguredLoginMethods(),
      getEnabledLoginMethodsAction(),
    ]);

  const isOwner = roleKey === "owner";
  const demoLocked = isDemoMode();
  const canMutate = isOwner && !demoLocked;

  return (
    <div className="space-y-6">
      {demoLocked ? (
        <DemoLockedNotice>
          Security and identity settings are locked in the demo.
        </DemoLockedNotice>
      ) : null}
      <Force2FACard enabled={securitySettings.require2fa} isOwner={canMutate} />
      <AdvancedSecurityCard settings={securitySettings} isOwner={canMutate} />
      <SsoCard
        providerConfigs={providerStatus}
        existingConfigs={existingConfigs}
        ssoProviders={ssoProviders}
      />
      <LoginMethodsCard
        configured={configuredLoginMethods}
        enabledMethods={enabledLoginMethods}
        isOwner={canMutate}
      />
      <ScimProvisioningCard tokens={scimTokens} workspaceId={organization.id} isOwner={canMutate} />
      <AuditLogsCard
        logs={auditLogRows}
        canExport={roleKey === "owner" || roleKey === "admin"}
      />
    </div>
  );
}
