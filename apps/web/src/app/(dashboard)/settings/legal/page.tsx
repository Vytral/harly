import { redirect } from "next/navigation";

import { LegalSettings } from "@/features/workspaces/LegalSettingsCard";
import { DsarRequestsSection } from "@/features/workspaces/DsarRequestsSection";
import { getDsarRequests } from "@/features/workspaces/dsar-actions";
import { getLegalSettingsData } from "@/features/workspaces/legal-settings-actions";
import { can } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function LegalSettingsPage() {
  const [canEditSettings, canManageDsar] = await Promise.all([
    can("settings:edit"),
    can("dsar:manage"),
  ]);
  if (!canEditSettings && !canManageDsar) redirect("/dashboard");

  const [settings, requests] = await Promise.all([
    canEditSettings ? getLegalSettingsData() : null,
    canManageDsar ? getDsarRequests() : [],
  ]);

  return (
    <div className="space-y-6">
      {settings ? <LegalSettings settings={settings} /> : null}
      {canManageDsar ? <DsarRequestsSection requests={requests} /> : null}
    </div>
  );
}
