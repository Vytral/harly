import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CaretLeftIcon } from "@/components/ui/icons/phosphor";
import { EmailSettingsForm } from "@/features/workspaces/EmailSettingsCard";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceEmailStatus } from "@/lib/email/config";

export const dynamic = "force-dynamic";

export default async function ConfigureEmailSettingsPage() {
  await requirePagePermission("settings:edit");
  const { organization } = await getWorkspaceContext();
  const status = await getWorkspaceEmailStatus(organization.id);

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
        <Link href="/settings/email">
          <CaretLeftIcon className="size-4" />
          Email settings
        </Link>
      </Button>
      <EmailSettingsForm status={status} />
    </div>
  );
}
