import { AiSettingsCard } from "@/features/workspaces/AiSettingsCard";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { getAssistantBranding } from "@/lib/ai/assistant-branding";
import { AssistantBrandingCard } from "@/features/workspaces/AssistantBrandingCard";
import { buildIntegrationHealthView } from "@/features/integrations/health/model";
import { getIntegrationHealth } from "@/features/integrations/health/repository";
import { IntegrationHealthNotice } from "@/features/integrations/health/ui/IntegrationHealthNotice";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  await requirePagePermission("settings:edit");
  const { organization, role } = await getWorkspaceContext();
  const [status, branding, storedHealth] = await Promise.all([
    getWorkspaceAiStatus(organization.id),
    getAssistantBranding(organization.id),
    getIntegrationHealth(organization.id),
  ]);
  // AI surfaces fall back to their non-AI path when the provider fails; the
  // recorded health is how a broken model or key becomes visible here.
  const health = buildIntegrationHealthView(
    "ai",
    status.enabled && status.hasApiKey && status.encryptionReady,
    storedHealth.ai ?? null,
  );
  const canEdit = role === "owner" || role === "admin";

  return (
    <div className="space-y-5">
      {health.needsAttention ? (
        <IntegrationHealthNotice
          health={health}
          reconnectHref={canEdit ? "/settings/ai/configure" : undefined}
        />
      ) : null}
      <AiSettingsCard status={status} canEdit={canEdit} />
      <AssistantBrandingCard branding={branding} canEdit={canEdit} />
    </div>
  );
}
