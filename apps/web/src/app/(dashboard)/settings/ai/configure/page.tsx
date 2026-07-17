import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CaretLeftIcon } from "@/components/ui/icons/phosphor";
import { AiSettingsForm } from "@/features/workspaces/AiSettingsCard";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAiStatus } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

export default async function ConfigureAiSettingsPage() {
  await requirePagePermission("settings:edit");
  const { organization } = await getWorkspaceContext();
  const status = await getWorkspaceAiStatus(organization.id);

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
        <Link href="/settings/ai">
          <CaretLeftIcon className="size-4" />
          AI settings
        </Link>
      </Button>
      <AiSettingsForm status={status} />
    </div>
  );
}
