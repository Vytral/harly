import type { ReactNode } from "react";

import { isDemoMode } from "@harly/config";

import { SettingsNav, SettingsSectionHeading } from "@/components/dashboard/SettingsNav";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
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

  // Updates change how the whole installation runs, so the section is for
  // owners only. It is not a permission key: no custom role can be granted it.
  const context = await getWorkspaceContextOrNull();
  if (context?.roleKey !== "owner") deniedHrefs.push("/settings/updates");
  // The public demo never exposes the MCP server.
  if (isDemoMode()) deniedHrefs.push("/settings/ai-agents");

  // The section title spans both columns so the nav card and the content cards
  // share one top edge; the nav then pins just under the 64px app header.
  return (
    <div>
      <SettingsSectionHeading />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[288px_minmax(0,1fr)] xl:gap-8">
        <aside className="min-w-0 lg:sticky lg:top-[88px] lg:max-h-[calc(100dvh-112px)] lg:self-start">
          <SettingsNav deniedHrefs={deniedHrefs} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
