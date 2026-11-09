import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { CaretLeftIcon } from "@/components/ui/icons/phosphor";
import { AiSettingsForm } from "@/features/workspaces/AiSettingsCard";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { isLocalLlmAllowed } from "@/lib/ai/local-llm";

export const dynamic = "force-dynamic";

export default async function ConfigureAiSettingsPage() {
  await requirePagePermission("settings:edit");
  const { organization } = await getWorkspaceContext();
  const status = await getWorkspaceAiStatus(organization.id);
  const t = await getTranslations("pages.settingsAiConfigure.page");

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
        <Link href="/settings/ai">
          <CaretLeftIcon className="size-4" />
          {t("backToAiSettings")}
        </Link>
      </Button>
      <AiSettingsForm status={status} allowLocalLlm={isLocalLlmAllowed()} />
    </div>
  );
}
