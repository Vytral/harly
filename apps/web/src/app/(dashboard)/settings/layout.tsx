import type { ReactNode } from "react";

import { SettingsNav } from "@/components/dashboard/SettingsNav";
import { getCurrentPermissions } from "@/features/workspaces/permissions-server";
import { SETTINGS_SECTION_PERMISSION } from "@/features/workspaces/permissions";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Hide nav sections the viewer can't open. Sections absent from the map are
  // open to everyone; each page also guards itself via requirePagePermission.
  const permissions = await getCurrentPermissions();
  const allowedHrefs = Object.entries(SETTINGS_SECTION_PERMISSION)
    .filter(([, perm]) => permissions.includes(perm))
    .map(([href]) => href);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your organization profile, team, and integrations.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[212px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <SettingsNav allowedHrefs={allowedHrefs} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
