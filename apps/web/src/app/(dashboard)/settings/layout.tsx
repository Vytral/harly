import type { ReactNode } from "react";

import { SettingsNav, SettingsSectionHeading } from "@/components/dashboard/SettingsNav";
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
    <div className="grid gap-6 lg:grid-cols-[288px_minmax(0,1fr)] xl:gap-8">
      <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start">
        <SettingsNav deniedHrefs={deniedHrefs} />
      </aside>
      <div className="min-w-0">
        <SettingsSectionHeading />
        {children}
      </div>
    </div>
  );
}
