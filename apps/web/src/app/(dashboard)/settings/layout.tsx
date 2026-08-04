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
  // Build a denylist (not an allowlist) from the map so unlisted hrefs stay
  // visible by default — SettingsNav then shows everything except these.
  const permissions = await getCurrentPermissions();
  const deniedHrefs = Object.entries(SETTINGS_SECTION_PERMISSION)
    .filter(([, required]) =>
      Array.isArray(required)
        ? !required.some((permission) => permissions.includes(permission))
        : !permissions.includes(required),
    )
    .map(([href]) => href);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your organization profile, team, and integrations.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)] xl:gap-8">
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto scrollbar-hide">
          <SettingsNav deniedHrefs={deniedHrefs} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
