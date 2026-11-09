"use client";

import { IntegrationHealthNotice } from "@/features/integrations/health/ui/IntegrationHealthNotice";
import type { IntegrationHealthView } from "@/features/integrations/health/model";
import { providerStatusLabel, providerStatusTone } from "@/features/integrations/health/connection-label";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import {
  disconnectGCalAction,
  listGCalCalendarsAction,
  saveGCalSettingsAction,
  testGCalConnectionAction,
  type GCalCalendar,
} from "@/features/workspaces/gcal-settings-actions";
import type { WorkspaceGCalStatus } from "@/lib/gcal/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import { GoogleCalendarLogo } from "@/components/ui/icons/brands";
import {
  GearSixIcon,
  SealCheckDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function GCalConnectPanel({
  status,
  canEdit,
  workspaceId,
  tileClassName,
  description,
  health,
}: {
  health?: IntegrationHealthView;
  status: WorkspaceGCalStatus;
  canEdit: boolean;
  workspaceId: string;
  tileClassName: string;
  description: string;
}) {
  const t = useTranslations("features.workspaces.gcalConnectPanel");
  const router = useRouter();
  const isConnected = status.hasRefreshToken;
  const [open, setOpen] = useState(isConnected);
  const [disconnecting, startDisconnect] = useTransition();
  const [testing, startTest] = useTransition();

  const statusTone = providerStatusTone(health, isConnected ? (status.enabled ? "on" : "off") : "neutral");
  const statusLabel = providerStatusLabel(health, isConnected
    ? status.enabled
      ? t("connected")
      : t("disabled")
    : t("notConnected"));

  const installUrl = `/api/integrations/google/install?ws=${workspaceId}`;

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectGCalAction();
      if (!result.ok) {
        toast.error(result.error ?? t("disconnectFailed"));
        return;
      }
      toast.success(t("disconnected"));
      router.refresh();
    });
  }

  function testConnection() {
    startTest(async () => {
      const result = await testGCalConnectionAction();
      if (result.ok) {
        toast.success(t("connectionWorking"));
      } else {
        toast.error(result.error ?? t("testFailed"));
        // An invalid_grant clears the stored token server-side. Refresh here so
        // the panel immediately changes from the stale connected state to the
        // actionable Connect Google state.
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={GoogleCalendarLogo}
        tileClassName={tileClassName}
        name="Google Calendar"
        description={description}
        statusLabel={statusLabel}
        statusTone={statusTone}
        action={
          canEdit ? (
            isConnected ? (
              <Button
                variant="outline"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                <GearSixIcon className="size-4" />
                {open ? t("hideSettings") : t("manage")}
              </Button>
            ) : status.hasCredentials ? (
              <Button asChild>
                <a href={installUrl}>
                  <GoogleCalendarLogo className="size-4" />
                  {t("connectGoogle")}
                </a>
              </Button>
            ) : (
              <Button disabled>
                <GoogleCalendarLogo className="size-4" />
                {t("credentialsNotSet")}
              </Button>
            )
          ) : null
        }
      />
      {health ? <IntegrationHealthNotice health={health} reconnectHref={installUrl} /> : null}

      {!status.hasCredentials && !isConnected ? (
        <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            {t.rich("credentialsHelp", {
              code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
            })}
          </p>
        </div>
      ) : null}

      {isConnected ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatCell label={t("account")}>
              <GoogleCalendarLogo className="size-4" />
              {status.accountEmail ?? t("notConnected")}
            </StatCell>
            <StatCell label={t("calendar")}>
              {status.calendarId === "primary"
                ? t("primaryCalendar")
                : status.calendarId ?? t("notSelected")}
            </StatCell>
            <StatCell label={t("status")}>
              <button
                type="button"
                onClick={testConnection}
                disabled={testing}
                className="flex items-center gap-1.5 text-sm font-medium text-pine hover:underline disabled:opacity-50"
              >
                {testing ? (
                  <SpinnerIcon className="size-3.5" />
                ) : (
                  <SealCheckDuotoneIcon className="size-3.5" />
                )}
                {testing ? t("testing") : t("testConnection")}
              </button>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {isConnected && canEdit ? (
        <InlineReveal open={open}>
          <GCalConfigForm
            currentCalendarId={status.calendarId}
            onSaved={() => router.refresh()}
            onDisconnect={disconnect}
            disconnecting={disconnecting}
          />
        </InlineReveal>
      ) : null}
    </div>
  );
}

function GCalConfigForm({
  currentCalendarId,
  onSaved,
  onDisconnect,
  disconnecting,
}: {
  currentCalendarId: string | null;
  onSaved: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const t = useTranslations("features.workspaces.gcalConfigForm");
  const [calendars, setCalendars] = useState<GCalCalendar[] | null>(null);
  const [selected, setSelected] = useState(currentCalendarId ?? "primary");
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  function loadCalendars() {
    startLoad(async () => {
      const result = await listGCalCalendarsAction();
      if (!result.ok) {
        toast.error(result.error ?? t("couldNotLoadCalendars"));
        return;
      }
      setCalendars(result.calendars);
    });
  }

  function save() {
    startSave(async () => {
      const result = await saveGCalSettingsAction({ calendarId: selected });
      if (!result.ok) {
        toast.error(result.error ?? t("saveFailed"));
        return;
      }
      toast.success(t("saved"));
      onSaved();
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-5 space-y-0.5">
        <h2 className="font-display text-base font-semibold tracking-tight">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t("calendar")}</Label>
        {calendars === null ? (
          <Button
            variant="outline"
            size="sm"
            onClick={loadCalendars}
            disabled={loading}
          >
            {loading ? <SpinnerIcon className="size-3.5" /> : null}
            {loading ? t("loadingCalendars") : t("loadCalendars")}
          </Button>
        ) : (
          <select
            className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {calendars.map((cal) => (
              <option key={cal.id} value={cal.id}>
                {cal.primary ? t("primaryOption", { name: cal.name }) : cal.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDisconnect}
          disabled={disconnecting}
        >
          {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
          {t("disconnect")}
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <SpinnerIcon className="size-3.5" /> : null}
          {t("save")}
        </Button>
      </div>
    </Card>
  );
}
