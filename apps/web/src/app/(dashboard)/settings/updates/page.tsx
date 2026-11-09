import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isDemoMode } from "@harly/config";

import { DemoLockedNotice } from "@/features/demo/DemoLockedNotice";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getUpdateOverview } from "@/features/updates/data";
import { AutoUpdateCard } from "@/features/updates/AutoUpdateCard";
import { UpdatesPanel, type UpdateRequestView } from "@/features/updates/UpdatesPanel";
import type { UpdateStatus } from "@/features/updates/update-request-state";
import type { UpdateRequest } from "@harly/db";

export const dynamic = "force-dynamic";

const toView = (request: UpdateRequest): UpdateRequestView => ({
  id: request.id,
  status: request.status as UpdateStatus,
  trigger: request.trigger === "auto" ? "auto" : "manual",
  fromVersion: request.fromVersion,
  targetVersion: request.targetVersion,
  message: request.message,
  logTail: request.logTail,
  createdAt: request.createdAt.toISOString(),
  finishedAt: request.finishedAt?.toISOString() ?? null,
});

export default async function UpdatesSettingsPage() {
  // Owners only, enforced here as well as in every action. A page that does
  // not exist for everyone else leaks nothing about how updates are run.
  const { organization, roleKey } = await getWorkspaceContext();
  if (roleKey !== "owner") notFound();

  const overview = await getUpdateOverview(organization.id);
  const { settings } = overview;
  const t = await getTranslations("pages.settingsUpdates.page");

  return (
    <div className="space-y-6">
      {isDemoMode() ? (
        <DemoLockedNotice>{t("demoLocked")}</DemoLockedNotice>
      ) : null}
      <UpdatesPanel
        view={{
          currentVersion: overview.currentVersion,
          latestVersion: overview.latestVersion,
          updateKind: overview.updateKind,
          notesUrl: overview.notesUrl,
          notesSummary: overview.notesSummary,
          lastCheckedAt: overview.lastCheckedAt?.toISOString() ?? null,
          checkError: overview.checkError,
          checkDisabled: overview.checkDisabled,
          updaterOnline: overview.updaterOnline,
          updaterLastSeenAt: overview.updaterLastSeenAt?.toISOString() ?? null,
          active: overview.active ? toView(overview.active) : null,
          history: overview.history.map(toView),
          timezone: settings.window.timezone,
        }}
      />
      <AutoUpdateCard
        initial={{
          enabled: settings.enabled,
          level: settings.level,
          days: [...settings.window.days],
          startHour: settings.window.startHour,
          endHour: settings.window.endHour,
          timezone: settings.window.timezone,
          nextWindowAt: overview.nextWindowAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
