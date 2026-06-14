"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Copy, KeyRound, Loader2, Webhook } from "lucide-react";

import {
  disableCalAction,
  registerCalWebhookAction,
  saveCalSettingsAction,
} from "@/features/workspaces/cal-settings-actions";
import type { WorkspaceCalStatus } from "@/lib/cal/config";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

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

  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 px-6 py-5">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-sage-ink">
          <CalendarClock className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold tracking-tight">Cal.com</h3>
            {status.hasApiKey ? (
              <Badge
                className={cn(
                  status.enabled
                    ? "bg-sage text-sage-ink"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {status.enabled ? "Connected" : "Disabled"}
              </Badge>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Let candidates self-schedule interviews. Bookings sync back into the
            pipeline automatically via webhook.
          </p>
        </div>
      </div>

      <div className="mt-auto space-y-4 border-t px-6 py-4">
        {!status.encryptionReady ? (
          <p className="rounded-md border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on the
            server to store the Cal.com key.
          </p>
        ) : null}

        {status.hasApiKey ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {status.bookingUrl ? (
              <Badge variant="outline" className="max-w-full truncate font-mono">
                {status.bookingUrl}
              </Badge>
            ) : null}
            {status.defaultEventTypeId ? (
              <Badge variant="secondary">event #{status.defaultEventTypeId}</Badge>
            ) : null}
            <Badge variant={status.hasWebhookSecret ? "secondary" : "outline"}>
              {status.hasWebhookSecret ? "Webhook secret set" : "No webhook secret"}
            </Badge>
          </div>
        ) : null}

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!status.encryptionReady}
                >
                  <KeyRound className="size-4" />
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
              <>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={status.enabled}
                    disabled={togglePending}
                    onCheckedChange={toggleEnabled}
                    aria-label="Enable Cal.com"
                  />
                  <span className="text-sm text-muted-foreground">
                    {status.enabled ? "On" : "Off"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={registerWebhook}
                  disabled={registering}
                  className="text-muted-foreground"
                >
                  {registering ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Webhook className="size-4" />
                  )}
                  Register webhook
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
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
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
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
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={copyWebhook}>
                <Copy className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Save first, then “Register webhook” auto-creates it in Cal.com — or
              add this URL manually under Cal.com webhooks.
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
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
