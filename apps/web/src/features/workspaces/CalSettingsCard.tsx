"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disableCalAction,
  registerCalWebhookAction,
  saveCalSettingsAction,
} from "@/features/workspaces/cal-settings-actions";
import type { WorkspaceCalStatus } from "@/lib/cal/config";
import {
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { CalcomLogo } from "@/components/ui/icons/brands";
import {
  CopyIcon,
  KeyDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
  WebhooksDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

export function CalSettingsCard({
  status,
  canEdit,
  webhookUrl,
}: {
  status: WorkspaceCalStatus;
  canEdit: boolean;
  webhookUrl: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [togglePending, startToggle] = useTransition();
  const [registering, startRegister] = useTransition();

  function toggleEnabled(next: boolean) {
    if (!status.hasApiKey && next) {
      toast.error("Add a Cal.com API key first.");
      return;
    }
    startToggle(async () => {
      const result = next
        ? await saveCalSettingsAction({ enabled: true })
        : await disableCalAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(next ? "Cal.com enabled" : "Cal.com disabled");
      router.refresh();
    });
  }

  function registerWebhook() {
    startRegister(async () => {
      const result = await registerCalWebhookAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not register webhook.");
        return;
      }
      toast.success("Webhook registered with Cal.com");
      router.refresh();
    });
  }

  const badge = status.hasApiKey ? (
    <StatusPill tone={status.enabled ? "on" : "off"}>
      {status.enabled ? "Connected" : "Disabled"}
    </StatusPill>
  ) : (
    <StatusPill tone="neutral">Not connected</StatusPill>
  );

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="p-6">
        <SectionHeader
          icon={CalcomLogo}
          title="Cal.com"
          badge={badge}
          description="Let candidates self-schedule interviews. Bookings sync back into the pipeline automatically via webhook."
          action={
            canEdit ? (
              <>
                <Sheet open={open} onOpenChange={setOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant={status.hasApiKey ? "outline" : "default"}
                      disabled={!status.encryptionReady}
                    >
                      <KeyDuotoneIcon className="size-4" />
                      {status.hasApiKey ? "Manage" : "Connect"}
                    </Button>
                  </SheetTrigger>
                  <CalSettingsForm
                    status={status}
                    webhookUrl={webhookUrl}
                    onSaved={() => {
                      setOpen(false);
                      router.refresh();
                    }}
                  />
                </Sheet>
                {status.hasApiKey ? (
                  <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                    <Switch
                      checked={status.enabled}
                      disabled={togglePending}
                      onCheckedChange={toggleEnabled}
                      aria-label="Enable Cal.com"
                    />
                    <span className="text-muted-foreground">
                      {status.enabled ? "On" : "Off"}
                    </span>
                  </label>
                ) : null}
              </>
            ) : null
          }
        />
      </div>

      {!status.encryptionReady ? (
        <div className="mx-6 mb-6 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on
            the server to store the Cal.com key.
          </p>
        </div>
      ) : null}

      {status.hasApiKey ? (
        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatCell label="Booking page">
            <span className="truncate text-muted-foreground">
              {status.bookingUrl ?? "Not set"}
            </span>
          </StatCell>
          <StatCell label="Event type">
            <span className="font-mono text-[13px]">
              {status.defaultEventTypeId
                ? `#${status.defaultEventTypeId}`
                : "—"}
            </span>
          </StatCell>
          <StatCell label="Webhook">
            {canEdit ? (
              <button
                type="button"
                onClick={registerWebhook}
                disabled={registering}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-pine transition-colors hover:text-pine-strong disabled:opacity-60"
              >
                {registering ? (
                  <SpinnerIcon className="size-3.5" />
                ) : (
                  <WebhooksDuotoneIcon className="size-3.5" />
                )}
                {status.hasWebhookSecret ? "Re-register" : "Register"}
              </button>
            ) : status.hasWebhookSecret ? (
              "Active"
            ) : (
              "Not set"
            )}
          </StatCell>
        </div>
      ) : null}
    </Card>
  );
}

function CalSettingsForm({
  status,
  webhookUrl,
  onSaved,
}: {
  status: WorkspaceCalStatus;
  webhookUrl: string | null;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(status.baseUrl);
  const [bookingUrl, setBookingUrl] = useState(status.bookingUrl ?? "");
  const [eventTypeId, setEventTypeId] = useState(
    status.defaultEventTypeId ? String(status.defaultEventTypeId) : "",
  );
  const [enabled, setEnabled] = useState(status.enabled || !status.hasApiKey);
  const [saving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      const result = await saveCalSettingsAction({
        enabled,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
        bookingUrl: bookingUrl || undefined,
        defaultEventTypeId: eventTypeId || undefined,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Cal.com settings saved");
      onSaved();
    });
  }

  function copyWebhook() {
    if (!webhookUrl) return;
    void navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  }

  return (
    <DrawerLayout
      title="Connect Cal.com"
      description="Your API key is encrypted at rest and never shown again."
      footer={
        <>
          <SheetClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={save} disabled={saving}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="cal-key">API key</Label>
          <Input
            id="cal-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              status.hasApiKey
                ? "•••••••• (stored — leave blank to keep)"
                : "cal_live_…"
            }
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Cal.com → Settings → Developer → API keys. Needs booking + webhook
            scopes.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cal-booking-url">Booking page URL</Label>
          <Input
            id="cal-booking-url"
            value={bookingUrl}
            onChange={(event) => setBookingUrl(event.target.value)}
            placeholder="https://cal.com/your-team/interview"
          />
          <p className="text-xs text-muted-foreground">
            Public link candidates use to pick a slot. Prefilled per candidate.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cal-event">Default event type ID</Label>
            <Input
              id="cal-event"
              inputMode="numeric"
              value={eventTypeId}
              onChange={(event) => setEventTypeId(event.target.value)}
              placeholder="e.g. 123456"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cal-base">API base URL</Label>
            <Input
              id="cal-base"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.cal.com/v2"
              className="font-mono text-xs"
            />
          </div>
        </div>

        {webhookUrl ? (
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button type="button"
                variant="outline"
                size="icon"
                onClick={copyWebhook}
              >
                <CopyIcon className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Save first, then “Register webhook” auto-creates it in Cal.com — or
              add this URL manually under Cal.com webhooks.
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable Cal.com</p>
            <p className="text-xs text-muted-foreground">
              When off, scheduling stays manual.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
    </DrawerLayout>
  );
}
