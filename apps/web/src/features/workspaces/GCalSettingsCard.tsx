"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disconnectGCalAction,
  listGCalCalendarsAction,
  saveGCalSettingsAction,
  testGCalConnectionAction,
  type GCalCalendar,
} from "@/features/workspaces/gcal-settings-actions";
import type { WorkspaceGCalStatus } from "@/lib/gcal/config";
import {
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { GoogleCalendarLogo } from "@/components/ui/icons/brands";
import {
  SpinnerIcon,
  WarningCircleIcon,
  SealCheckDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";

export function GCalSettingsCard({
  status,
  canEdit,
  workspaceId,
}: {
  status: WorkspaceGCalStatus;
  canEdit: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
  const [configOpen, setConfigOpen] = useState(false);
  const [disconnecting, startDisconnect] = useTransition();
  const [testing, startTest] = useTransition();

  const isConnected = status.hasRefreshToken;

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectGCalAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not disconnect.");
        return;
      }
      toast.success("Google Calendar disconnected");
      router.refresh();
    });
  }

  function testConnection() {
    startTest(async () => {
      const result = await testGCalConnectionAction();
      if (result.ok) {
        toast.success("Connection is working!");
      } else {
        toast.error(result.error ?? "Connection test failed.");
      }
    });
  }

  const badge = isConnected ? (
    <StatusPill tone={status.enabled ? "on" : "off"}>
      {status.enabled ? "Connected" : "Disabled"}
    </StatusPill>
  ) : (
    <StatusPill tone="neutral">Not connected</StatusPill>
  );

  const installUrl = `/api/integrations/google/install?ws=${workspaceId}`;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="p-6">
        <SectionHeader
          icon={(props) => <GoogleCalendarLogo {...props} />}
          title="Google Calendar"
          badge={badge}
          description={
            isConnected
              ? "Interviews are synced to your connected Google Calendar."
              : "Connect Google Calendar to automatically create interview events and check availability."
          }
          action={
            canEdit ? (
              <>
                {isConnected ? (
                  <Sheet open={configOpen} onOpenChange={setConfigOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline">Configure</Button>
                    </SheetTrigger>
                    <GCalConfigForm
                      currentCalendarId={status.calendarId}
                      onSaved={() => {
                        setConfigOpen(false);
                        router.refresh();
                      }}
                    />
                  </Sheet>
                ) : status.hasCredentials ? (
                  <Button asChild>
                    <a href={installUrl}>
                      <GoogleCalendarLogo className="size-4" />
                      Connect Google
                    </a>
                  </Button>
                ) : (
                  <Button disabled>
                    <GoogleCalendarLogo className="size-4" />
                    Credentials not set
                  </Button>
                )}
              </>
            ) : null
          }
        />

        {!status.hasCredentials && !isConnected ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              Set <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code>{" "}
              and <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code>{" "}
              on the server to enable Google Calendar.
            </p>
          </div>
        ) : null}
      </div>

      {isConnected ? (
        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatCell label="Account">
            <GoogleCalendarLogo className="size-4" />
            {status.accountEmail ?? "—"}
          </StatCell>
          <StatCell label="Calendar">
            {status.calendarId === "primary"
              ? "Primary calendar"
              : status.calendarId ?? "—"}
          </StatCell>
          <StatCell label="Status">
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
              {testing ? "Testing…" : "Test connection"}
            </button>
          </StatCell>
        </div>
      ) : null}

      {isConnected && canEdit ? (
        <div className="border-t px-6 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={disconnect}
            disabled={disconnecting}
          >
            {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
            Disconnect Google Calendar
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function GCalConfigForm({
  currentCalendarId,
  onSaved,
}: {
  currentCalendarId: string | null;
  onSaved: () => void;
}) {
  const [calendars, setCalendars] = useState<GCalCalendar[] | null>(null);
  const [selected, setSelected] = useState(currentCalendarId ?? "primary");
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  function loadCalendars() {
    startLoad(async () => {
      const result = await listGCalCalendarsAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not load calendars.");
        return;
      }
      setCalendars(result.calendars);
    });
  }

  function save() {
    startSave(async () => {
      const result = await saveGCalSettingsAction({ calendarId: selected });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Calendar saved");
      onSaved();
    });
  }

  return (
    <DrawerLayout
      title="Configure Google Calendar"
      description="Choose which calendar to use for interview events."
      footer={
        <>
          <SheetClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={save} disabled={saving}>
            {saving ? <SpinnerIcon className="size-3.5" /> : null}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Calendar</Label>
          {calendars === null ? (
            <Button
              variant="outline"
              size="sm"
              onClick={loadCalendars}
              disabled={loading}
            >
              {loading ? <SpinnerIcon className="size-3.5" /> : null}
              {loading ? "Loading calendars…" : "Load calendars"}
            </Button>
          ) : (
            <select
              className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.name}
                  {cal.primary ? " (Primary)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </DrawerLayout>
  );
}
