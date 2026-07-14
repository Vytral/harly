"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disconnectOutlookAction,
  listOutlookCalendarsAction,
  saveOutlookCredentialsAction,
  saveOutlookSettingsAction,
  testOutlookAction,
  type OutlookCalendarItem,
} from "@/features/workspaces/outlook-settings-actions";
import type { WorkspaceOutlookStatus } from "@/lib/outlook/config";
import {
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import {
  PaperPlaneDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MicrosoftOutlookLogo } from "@/components/ui/icons/brands";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type EventOption = { value: string; label: string };

function OutlookIcon(props: React.SVGProps<SVGSVGElement>) {
  return <MicrosoftOutlookLogo {...props} />;
}

export function OutlookSettingsCard({
  status,
  events,
  canEdit,
  workspaceId,
}: {
  status: WorkspaceOutlookStatus;
  events: EventOption[];
  canEdit: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [togglePending, startToggle] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const isConnected = status.hasToken;

  function toggleEnabled(next: boolean) {
    if (!isConnected) return;
    if (next && !status.calendarId) {
      toast.error("Select a calendar first.");
      return;
    }
    startToggle(async () => {
      const result = await saveOutlookSettingsAction({
        enabled: next,
        calendarId: status.calendarId ?? "",
        events: status.events,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(
        next ? "Outlook notifications on" : "Outlook notifications off",
      );
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectOutlookAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not disconnect.");
        return;
      }
      toast.success("Outlook disconnected");
      router.refresh();
    });
  }

  const badge = isConnected ? (
    <StatusPill tone={status.enabled ? "on" : "off"}>
      {status.enabled ? "Connected" : "Disabled"}
    </StatusPill>
  ) : (
    <StatusPill tone="neutral">Not connected</StatusPill>
  );

  const installUrl = `/api/integrations/outlook/install?ws=${workspaceId}`;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="p-6">
        <SectionHeader
          icon={(props) => <OutlookIcon {...props} />}
          title="Microsoft Outlook"
          badge={badge}
          description={
            isConnected
              ? "Calendar events and email notifications via Microsoft Graph API."
              : "Connect your Microsoft account for calendar sync and email notifications."
          }
          action={
            canEdit ? (
              <>
                {isConnected ? (
                  <>
                    <Sheet open={open} onOpenChange={setOpen}>
                      <SheetTrigger asChild>
                        <Button variant="outline">Configure</Button>
                      </SheetTrigger>
                      <OutlookConfigForm
                        status={status}
                        events={events}
                        onSaved={() => {
                          setOpen(false);
                          router.refresh();
                        }}
                      />
                    </Sheet>
                    <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                      <Switch
                        checked={status.enabled}
                        disabled={togglePending}
                        onCheckedChange={toggleEnabled}
                        aria-label="Enable Outlook notifications"
                      />
                      <span className="text-muted-foreground">
                        {status.enabled ? "On" : "Off"}
                      </span>
                    </label>
                  </>
                ) : status.hasCredentials ? (
                  <Button asChild>
                    <a href={installUrl}>
                      <OutlookIcon className="size-4" />
                      Connect Microsoft
                    </a>
                  </Button>
                ) : (
                  <Sheet
                    open={credentialsOpen}
                    onOpenChange={setCredentialsOpen}
                  >
                    <SheetTrigger asChild>
                      <Button disabled={!status.encryptionReady}>
                        <OutlookIcon className="size-4" />
                        Set up Outlook
                      </Button>
                    </SheetTrigger>
                    <OutlookCredentialsForm
                      onSaved={() => {
                        setCredentialsOpen(false);
                        router.refresh();
                      }}
                    />
                  </Sheet>
                )}
              </>
            ) : null
          }
        />

        {!status.encryptionReady && !isConnected ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              Set{" "}
              <code className="font-mono text-xs">
                AI_ENCRYPTION_KEY
              </code>{" "}
              on the server to enable encrypted credential storage.
            </p>
          </div>
        ) : null}
      </div>

      {isConnected ? (
        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatCell label="Account">
            <OutlookIcon className="size-4" />
            {status.accountEmail ?? "—"}
          </StatCell>
          <StatCell label="Calendar">
            {status.calendarId ? "Selected" : "Not selected"}
          </StatCell>
          <StatCell label="Events">
            <span className="text-muted-foreground">
              {status.events.length === 0
                ? "None selected"
                : `${status.events.length} subscribed`}
            </span>
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
            Disconnect Outlook
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** Form to enter Outlook App credentials (Client ID + Secret) */
function OutlookCredentialsForm({ onSaved }: { onSaved: () => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      const result = await saveOutlookCredentialsAction({
        clientId,
        clientSecret,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Outlook credentials saved. You can now connect.");
      onSaved();
    });
  }

  return (
    <DrawerLayout
      title="Set up Microsoft Outlook"
      description="Register an app at portal.azure.com, then paste the credentials here. Your Client Secret is encrypted at rest."
      footer={
        <>
          <SheetClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button
            onClick={save}
            disabled={saving || !clientId.trim() || !clientSecret.trim()}
          >
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save credentials
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">
            How to get credentials:
          </p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>
              Go to{" "}
              <a
                href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Azure App Registrations
              </a>{" "}
              and register a new app
            </li>
            <li>
              Under Authentication, add a Mobile and desktop redirect URI:{" "}
              <code>
                {typeof window !== "undefined" ? window.location.origin : ""}
                /api/integrations/outlook/callback
              </code>
            </li>
            <li>
              Under API permissions, add: Cal.ReadWrite, Mail.Send, offline_access, User.Read
            </li>
            <li>Copy the Application (client) ID and create a Client Secret</li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label htmlFor="outlook-client-id">Application (client) ID</Label>
          <Input
            id="outlook-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="e.g. 12345678-1234-1234-1234-123456789012"
            autoComplete="off"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="outlook-client-secret">Client Secret</Label>
          <Input
            id="outlook-client-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="e.g. ~abc..."
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Encrypted at rest — never visible again after saving.
          </p>
        </div>
      </div>
    </DrawerLayout>
  );
}

/** Form to configure calendar + events after OAuth connection */
function OutlookConfigForm({
  status,
  events,
  onSaved,
}: {
  status: WorkspaceOutlookStatus;
  events: EventOption[];
  onSaved: () => void;
}) {
  const [calendars, setCalendars] = useState<OutlookCalendarItem[]>([]);
  const [loadingCalendars, startLoadCalendars] = useTransition();
  const [calendarId, setCalendarId] = useState(status.calendarId ?? "");
  const [selected, setSelected] = useState<string[]>(
    status.events.length > 0 ? status.events : events.map((e) => e.value),
  );
  const [enabled, setEnabled] = useState(status.enabled);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const [loaded, setLoaded] = useState(false);

  function loadCalendars() {
    startLoadCalendars(async () => {
      const result = await listOutlookCalendarsAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCalendars(result.calendars);
      setLoaded(true);
    });
  }

  function toggleEvent(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function runTest() {
    startTest(async () => {
      const result = await testOutlookAction();
      if (!result.ok) {
        toast.error(result.error ?? "Test failed.");
        return;
      }
      toast.success("Test email sent via Outlook!");
    });
  }

  function save() {
    if (!calendarId) {
      toast.error("Select a calendar first.");
      return;
    }
    startSave(async () => {
      const result = await saveOutlookSettingsAction({
        enabled,
        calendarId,
        events: selected,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Outlook settings saved");
      onSaved();
    });
  }

  return (
    <DrawerLayout
      title="Configure Outlook"
      description={`Connected to ${status.accountEmail ?? "Outlook"}. Choose a calendar and events.`}
      footer={
        <>
          <SheetClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={save} disabled={saving || !calendarId}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Calendar</Label>
          {!loaded ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={loadCalendars}
              disabled={loadingCalendars}
            >
              {loadingCalendars ? <SpinnerIcon className="size-4" /> : null}
              Load calendars from Outlook
            </Button>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
              {calendars.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  No calendars found.
                </p>
              ) : (
                calendars.map((cal) => (
                  <button
                    key={cal.id}
                    type="button"
                    onClick={() => setCalendarId(cal.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                      calendarId === cal.id
                        ? "bg-sage text-sage-ink font-medium"
                        : "hover:bg-muted",
                    )}
                  >
                    {cal.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Notify on</Label>
          <div className="flex flex-wrap gap-1.5">
            {events.map((event) => (
              <button
                key={event.value}
                type="button"
                onClick={() => toggleEvent(event.value)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                  selected.includes(event.value)
                    ? "border-pine/40 bg-sage/50 text-sage-ink"
                    : "bg-card text-muted-foreground hover:border-foreground/15 hover:text-foreground",
                )}
              >
                {event.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable</p>
            <p className="text-xs text-muted-foreground">
              When off, no notifications are sent.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={runTest}
          disabled={testing || !calendarId}
        >
          {testing ? (
            <SpinnerIcon className="size-4" />
          ) : (
            <PaperPlaneDuotoneIcon className="size-4" />
          )}
          Send test email
        </Button>
      </div>
    </DrawerLayout>
  );
}
