import { CompanyBrandingSection } from "@/features/workspaces/CompanyBrandingSection";
import { getWorkspaceSettingsData } from "@/features/workspaces/data";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePagePermission("settings:edit");
  const { context, branding } = await getWorkspaceSettingsData();

  return (
    <CompanyBrandingSection workspace={branding} currentRole={context.role} />
  );
}
