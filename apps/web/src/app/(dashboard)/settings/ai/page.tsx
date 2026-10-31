import { AiSettingsCard } from "@/features/workspaces/AiSettingsCard";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { getAssistantBranding } from "@/lib/ai/assistant-branding";
import { AssistantBrandingCard } from "@/features/workspaces/AssistantBrandingCard";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  await requirePagePermission("settings:edit");
  const { organization, role } = await getWorkspaceContext();
  const [status, branding] = await Promise.all([
    getWorkspaceAiStatus(organization.id),
    getAssistantBranding(organization.id),
  ]);
  const canEdit = role === "owner" || role === "admin";

  return (
    <div className="space-y-5">
      <AiSettingsCard status={status} canEdit={canEdit} />
      <AssistantBrandingCard branding={branding} canEdit={canEdit} />
    </div>
  );
}
