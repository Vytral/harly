import { AiSettingsCard } from "@/features/workspaces/AiSettingsCard";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getWorkspaceAiStatus } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const { organization, role } = await getWorkspaceContext();
  const status = await getWorkspaceAiStatus(organization.id);
  const canEdit = role === "owner" || role === "admin";

  return <AiSettingsCard status={status} canEdit={canEdit} />;
}
