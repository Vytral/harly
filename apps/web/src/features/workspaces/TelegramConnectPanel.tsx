"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import {
  disconnectTelegramAction,
  saveTelegramSettingsAction,
  sendTestTelegramAction,
} from "@/features/workspaces/telegram-settings-actions";
import type { WorkspaceTelegramStatus } from "@/lib/telegram/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import { TheSvgLogo } from "@/components/ui/icons/brands";
import {
  ArrowUpRightIcon,
  GearSixIcon,
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
import { cn } from "@/lib/utils";

type EventOption = { value: string; label: string };

function TelegramLogo({ className }: { className?: string }) {
  return <TheSvgLogo slug="telegram" alt="Telegram" className={className} />;
}

export function TelegramConnectPanel({
  status,
  events,
  canEdit,
  tileClassName,
  description,
}: {
  status: WorkspaceTelegramStatus;
  events: EventOption[];
  canEdit: boolean;
  tileClassName: string;
  description: string;
}) {
  const router = useRouter();
  const isConnected = status.hasToken;
  const [open, setOpen] = useState(isConnected);
  const [togglePending, startToggle] = useTransition();

  const statusTone = isConnected ? (status.enabled ? "on" : "off") : "neutral";
  const statusLabel = isConnected
    ? status.enabled
      ? "Connected"
      : "Disabled"
    : "Not connected";

  function toggleEnabled(next: boolean) {
    if (!isConnected) return;
    if (next && !status.chatId) {
      toast.error("Add a chat ID first.");
      return;
    }
    startToggle(async () => {
      const result = await saveTelegramSettingsAction({
        enabled: next,
        chatId: status.chatId ?? "",
        events: status.events,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(
        next ? "Telegram notifications on" : "Telegram notifications off",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={TelegramLogo}
        tileClassName={tileClassName}
        name="Telegram"
        description={description}
        statusLabel={statusLabel}
        statusTone={statusTone}
        action={
          canEdit ? (
            <>
              <Button
                variant={isConnected ? "outline" : "default"}
                disabled={!status.encryptionReady}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                {isConnected ? (
                  <GearSixIcon className="size-4" />
                ) : (
                  <KeyDuotoneIcon className="size-4" />
                )}
                {isConnected ? (open ? "Hide settings" : "Manage") : "Connect"}
              </Button>
              {isConnected ? (
                <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                  <Switch
                    checked={status.enabled}
                    disabled={togglePending}
                    onCheckedChange={toggleEnabled}
                    aria-label="Enable Telegram notifications"
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
        <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on
            the server to store the bot token.
          </p>
        </div>
      ) : null}

      {isConnected ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatCell label="Bot">
              <TelegramLogo className="size-4" />
              {status.botUsername ? `@${status.botUsername}` : "Connected"}
            </StatCell>
            <StatCell label="Chat">
              <span className="font-mono text-[13px]">
                {status.chatId ?? "Not set"}
              </span>
            </StatCell>
            <StatCell label="Events">
              <span className="text-muted-foreground">
                {status.events.length === 0
                  ? "None selected"
                  : `${status.events.length} subscribed`}
              </span>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {canEdit ? (
        <InlineReveal open={open}>
          <TelegramConnectForm
            status={status}
            events={events}
            onSaved={() => router.refresh()}
          />
        </InlineReveal>
      ) : null}
    </div>
  );
}

function TelegramConnectForm({
  status,
  events,
  onSaved,
}: {
  status: WorkspaceTelegramStatus;
  events: EventOption[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState(status.chatId ?? "");
  const [selected, setSelected] = useState<string[]>(
    status.events.length > 0 ? status.events : events.map((e) => e.value),
  );
  const [enabled, setEnabled] = useState(status.enabled || !status.hasToken);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  function toggleEvent(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  const canTest =
    (botToken.trim().length > 0 || status.hasToken) && chatId.trim().length > 0;

  function runTest() {
    startTest(async () => {
      const result = await sendTestTelegramAction({
        botToken: botToken || undefined,
        chatId: chatId || undefined,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Test failed.");
        return;
      }
      toast.success("Test message sent to Telegram");
    });
  }

  function save() {
    startSave(async () => {
      const result = await saveTelegramSettingsAction({
        enabled,
        botToken: botToken || undefined,
        chatId,
        events: selected,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Telegram settings saved");
      onSaved();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectTelegramAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not disconnect.");
        return;
      }
      toast.success("Telegram disconnected");
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            {status.hasToken ? "Manage connection" : "Connect Telegram"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Your bot token is validated with Telegram and encrypted at rest.
          </p>
        </div>
        <a
          href="https://core.telegram.org/bots/features#botfather"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          BotFather docs
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>

      <div className="space-y-5">
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">How to set up:</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Message <code>@BotFather</code> on Telegram → <code>/newbot</code>{" "}
              → copy the token
            </li>
            <li>Add the bot to your group/channel (as admin for channels)</li>
            <li>
              Get the chat ID: forward a message from the chat to{" "}
              <code>@userinfobot</code>, or use{" "}
              <code>getUpdates</code> on the Bot API
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tg-token">Bot token</Label>
          <Input
            id="tg-token"
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={
              status.hasToken
                ? "•••••••• (stored, leave blank to keep)"
                : "123456789:AAF3xkcyTgh…"
            }
            autoComplete="off"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tg-chat">Chat ID</Label>
          <Input
            id="tg-chat"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="e.g. -1001234567890"
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Group and channel IDs are negative numbers. The bot must be a member.
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
              When off, no messages are sent.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
        {status.hasToken ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={disconnect}
            disabled={disconnecting}
          >
            {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
            Disconnect
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={runTest}
            disabled={testing || !canTest}
          >
            {testing ? (
              <SpinnerIcon className="size-4" />
            ) : (
              <PaperPlaneDuotoneIcon className="size-4" />
            )}
            Send test
          </Button>
          <Button onClick={save} disabled={saving || !chatId.trim()}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save
          </Button>
        </div>
      </div>
    </Card>
  );
}
