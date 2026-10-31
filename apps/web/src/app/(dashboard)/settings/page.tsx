import { redirect } from "next/navigation";

import { CompanyBrandingSection } from "@/features/workspaces/CompanyBrandingSection";
import { GravatarSettingsCard } from "@/features/workspaces/GravatarSettingsCard";
import { RejectionReasonsCard } from "@/features/rejection-reasons/RejectionReasonsCard";
import { listRejectionReasons } from "@/features/rejection-reasons/data";
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
  const rejectionReasons = await listRejectionReasons(context.organization.id, {
    includeArchived: true,
  });

  return (
    <div className="space-y-6">
      <CompanyBrandingSection workspace={branding} currentRole={context.role} />
      <GravatarSettingsCard enabled={branding.gravatarEnabled} />
      <RejectionReasonsCard reasons={rejectionReasons} />
    </div>
  );
}
