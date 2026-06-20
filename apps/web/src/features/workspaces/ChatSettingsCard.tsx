"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disableChatAction,
  saveChatSettingsAction,
  sendTestChatAction,
} from "@/features/workspaces/chat-settings-actions";
import type {
  ChatProviderId,
  WorkspaceChatStatus,
} from "@/lib/notify/config";
import {
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { SlackLogo, DiscordLogo } from "@/components/ui/icons/brands";
import {
  KeyDuotoneIcon,
  PaperPlaneDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type EventOption = { value: string; label: string };

const PROVIDER_LABEL: Record<ChatProviderId, string> = {
  slack: "Slack",
  discord: "Discord",
};

function ProviderMark({
  provider,
  className,
}: {
  provider: ChatProviderId;
  className?: string;
}) {
  return provider === "slack" ? (
    <SlackLogo className={className} />
  ) : (
    <DiscordLogo className={className} />
  );
}

export function ChatSettingsCard({
  status,
  events,
  canEdit,
}: {
  status: WorkspaceChatStatus;
  events: EventOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [togglePending, startToggle] = useTransition();

  const isConfigured = status.hasWebhook;

  function toggleEnabled(next: boolean) {
    if (!isConfigured && next) {
      toast.error("Connect a channel first.");
      return;
    }
    startToggle(async () => {
      const result = next
        ? await saveChatSettingsAction({
            enabled: true,
            provider: status.provider ?? "slack",
            events: status.events,
          })
        : await disableChatAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(next ? "Notifications on" : "Notifications off");
      router.refresh();
    });
  }

  const badge = isConfigured ? (
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
          icon={(props) =>
            status.provider ? (
              <ProviderMark provider={status.provider} {...props} />
            ) : (
              <SlackLogo {...props} />
            )
          }
          title="Chat notifications"
          badge={badge}
          description="Post new applications, stage moves, hires and more to a Slack or Discord channel. Paste an incoming-webhook URL — no OAuth, no setup."
          action={
            canEdit ? (
              <>
                <Sheet open={open} onOpenChange={setOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant={isConfigured ? "outline" : "default"}
                      disabled={!status.encryptionReady}
                    >
                      <KeyDuotoneIcon className="size-4" />
                      {isConfigured ? "Manage" : "Connect"}
                    </Button>
                  </SheetTrigger>
                  <ChatSettingsForm
                    status={status}
                    events={events}
                    onSaved={() => {
                      setOpen(false);
                      router.refresh();
                    }}
                  />
                </Sheet>
                {isConfigured ? (
                  <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                    <Switch
                      checked={status.enabled}
                      disabled={togglePending}
                      onCheckedChange={toggleEnabled}
                      aria-label="Enable chat notifications"
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

        {!status.encryptionReady ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on
              the server to store the webhook URL.
            </p>
          </div>
        ) : null}
      </div>

      {isConfigured ? (
        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <StatCell label="Channel">
            {status.provider ? (
              <>
                <ProviderMark provider={status.provider} className="size-4" />
                {PROVIDER_LABEL[status.provider]}
              </>
            ) : (
              "—"
            )}
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
    </Card>
  );
}

function ChatSettingsForm({
  status,
  events,
  onSaved,
}: {
  status: WorkspaceChatStatus;
  events: EventOption[];
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState<ChatProviderId>(
    status.provider ?? "slack",
  );
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selected, setSelected] = useState<string[]>(
    status.events.length > 0 ? status.events : events.map((e) => e.value),
  );
  const [enabled, setEnabled] = useState(status.enabled || !status.hasWebhook);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();

  function toggleEvent(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  const canTest = webhookUrl.trim().length > 0 || status.hasWebhook;

  function runTest() {
    startTest(async () => {
      const result = await sendTestChatAction({
        provider,
        webhookUrl: webhookUrl || undefined,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Test failed.");
        return;
      }
      toast.success(`Test message sent to ${PROVIDER_LABEL[provider]}`);
    });
  }

  function save() {
    startSave(async () => {
      const result = await saveChatSettingsAction({
        enabled,
        provider,
        webhookUrl: webhookUrl || undefined,
        events: selected,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Notification settings saved");
      onSaved();
    });
  }

  const placeholder =
    provider === "slack"
      ? "https://hooks.slack.com/services/T000/B000/xxxx"
      : "https://discord.com/api/webhooks/000/xxxx";

  return (
    <DrawerLayout
      title="Connect chat notifications"
      description="Your webhook URL is encrypted at rest and never shown again."
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
          <Label>Destination</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["slack", "discord"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                  provider === p
                    ? "border-pine bg-sage text-sage-ink"
                    : "text-muted-foreground hover:border-foreground/15",
                )}
              >
                <ProviderMark provider={p} className="size-4" />
                {PROVIDER_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="chat-webhook">Incoming webhook URL</Label>
          <Input
            id="chat-webhook"
            type="password"
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
            placeholder={
              status.hasWebhook
                ? "•••••••• (stored — leave blank to keep)"
                : placeholder
            }
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            {provider === "slack" ? (
              <>
                Slack → Apps → Incoming Webhooks → Add to a channel, then copy the
                URL.
              </>
            ) : (
              <>
                Discord → Server Settings → Integrations → Webhooks → New Webhook,
                then Copy URL.
              </>
            )}
          </p>
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
              When off, no messages are posted.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={runTest}
          disabled={testing || !canTest}
        >
          {testing ? (
            <SpinnerIcon className="size-4" />
          ) : (
            <PaperPlaneDuotoneIcon className="size-4" />
          )}
          Send test message
        </Button>
      </div>
    </DrawerLayout>
  );
}
