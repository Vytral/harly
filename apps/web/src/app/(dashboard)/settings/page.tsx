import { CompanyBrandingSection } from "@/features/workspaces/CompanyBrandingSection";
import { getWorkspaceSettingsData } from "@/features/workspaces/data";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { context, branding } = await getWorkspaceSettingsData();

  return (
    <CompanyBrandingSection workspace={branding} currentRole={context.role} />
  );
}
