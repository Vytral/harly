import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CaretLeftIcon } from "@/components/ui/icons/phosphor";
import { ReplyHandlingSettingsForm } from "@/features/workspaces/ReplyHandlingSettingsCard";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceInboundEmailStatus } from "@/lib/email/config";
import { getMailboxStatus } from "@/lib/mailbox/config";

export const dynamic = "force-dynamic";

export default async function ConfigureReplyHandlingPage() {
  await requirePagePermission("settings:edit");
  const { organization } = await getWorkspaceContext();
  const [mailboxStatus, inboundStatus] = await Promise.all([
    getMailboxStatus(organization.id),
    getWorkspaceInboundEmailStatus(organization.id),
  ]);

  const initialMode = mailboxStatus.enabled || (!inboundStatus.enabled && mailboxStatus.configured)
    ? "mailbox"
    : "threaded";

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
        <Link href="/settings/email">
          <CaretLeftIcon className="size-4" />
          Email settings
        </Link>
      </Button>
      <ReplyHandlingSettingsForm
        mailboxStatus={mailboxStatus}
        inboundStatus={inboundStatus}
        workspaceId={organization.id}
        initialMode={initialMode}
      />
    </div>
  );
}
