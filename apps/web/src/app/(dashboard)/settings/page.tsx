import { redirect } from "next/navigation";

import { CompanyBrandingSection } from "@/features/workspaces/CompanyBrandingSection";
import { getWorkspaceSettingsData } from "@/features/workspaces/data";
import { can, requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // DSAR reviewers can enter Settings from the app sidebar, but should land on
  // their scoped Legal & Compliance surface rather than company settings.
  if (!(await can("settings:edit"))) {
    if (await can("dsar:manage")) redirect("/settings/legal");
  }
  await requirePagePermission("settings:edit");
  const { context, branding } = await getWorkspaceSettingsData();

  return (
    <CompanyBrandingSection workspace={branding} currentRole={context.role} />
  );
}
