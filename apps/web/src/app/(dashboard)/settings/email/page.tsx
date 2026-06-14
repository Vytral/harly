import { EmailSettingsCard } from "@/features/workspaces/EmailSettingsCard";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getWorkspaceEmailStatus } from "@/lib/email/config";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const { organization, role } = await getWorkspaceContext();
  const status = await getWorkspaceEmailStatus(organization.id);
  const canEdit = role === "owner" || role === "admin";

  return <EmailSettingsCard status={status} canEdit={canEdit} />;
}
