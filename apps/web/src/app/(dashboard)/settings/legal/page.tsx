import { LegalSettings } from "@/features/workspaces/LegalSettingsCard";
import { getLegalSettingsData } from "@/features/workspaces/legal-settings-actions";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function LegalSettingsPage() {
  await requirePagePermission("settings:edit");
  const settings = await getLegalSettingsData();

  return <LegalSettings settings={settings} />;
}
