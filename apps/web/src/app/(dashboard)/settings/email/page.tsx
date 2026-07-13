import { EmailSettingsCard } from "@/features/workspaces/EmailSettingsCard";
import { ReplyHandlingSettingsCard } from "@/features/workspaces/ReplyHandlingSettingsCard";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import {
  getWorkspaceEmailStatus,
  getWorkspaceInboundEmailStatus,
} from "@/lib/email/config";
import { getMailboxStatus } from "@/lib/mailbox/config";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  await requirePagePermission("settings:edit");
  const { organization, role } = await getWorkspaceContext();
  const [status, inboundStatus, mailboxStatus] = await Promise.all([
    getWorkspaceEmailStatus(organization.id),
    getWorkspaceInboundEmailStatus(organization.id),
    getMailboxStatus(organization.id),
  ]);
  const canEdit = role === "owner" || role === "admin";

  return (
    <div className="space-y-6">
      <EmailSettingsCard status={status} canEdit={canEdit} />
      <ReplyHandlingSettingsCard
        mailboxStatus={mailboxStatus}
        inboundStatus={inboundStatus}
        canEdit={canEdit}
        workspaceId={organization.id}
      />
    </div>
  );
}
