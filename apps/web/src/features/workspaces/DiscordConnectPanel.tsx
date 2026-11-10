"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import {
  disableChatAction,
  saveChatSettingsAction,
  sendTestChatAction,
} from "@/features/workspaces/chat-settings-actions";
import type { WorkspaceChatStatus } from "@/lib/notify/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import { DiscordLogo } from "@/components/ui/icons/brands";
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
import { SecretInput } from "@/components/ui/secret-input";
import { Label } from "@/components/ui/label";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type EventOption = { value: string; label: string };

/**
 * Discord notifications via incoming webhook. Rides the shared chat-settings
 * backend (chat* columns) with the provider locked to "discord" , Slack has
 * its own dedicated OAuth integration.
 */
export function DiscordConnectPanel({
  status,
  events,
  canEdit,
  tileClassName,
  description,
}: {
  status: WorkspaceChatStatus;
  events: EventOption[];
  canEdit: boolean;
  tileClassName: string;
  description: string;
}) {
  const t = useTranslations("features.workspaces.discordConnectPanel");
  const router = useRouter();
  // Only treat the shared chat config as "Discord connected" when the stored
  // provider actually is discord.
  const isConnected = status.hasWebhook && status.provider === "discord";
  const [open, setOpen] = useState(isConnected);
  const [togglePending, startToggle] = useTransition();

  const statusTone = isConnected ? (status.enabled ? "on" : "off") : "neutral";
  const statusLabel = isConnected
    ? status.enabled
      ? t("connected")
      : t("disabled")
    : t("notConnected");

  function toggleEnabled(next: boolean) {
    if (!isConnected) return;
    startToggle(async () => {
      const result = next
        ? await saveChatSettingsAction({
            enabled: true,
            provider: "discord",
            events: status.events,
          })
        : await disableChatAction();
      if (!result.ok) {
        toast.error(result.error ?? t("updateFailed"));
        return;
      }
      toast.success(next ? t("notificationsOn") : t("notificationsOff"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={DiscordLogo}
        tileClassName={tileClassName}
        name="Discord"
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
                {isConnected
                  ? open
                    ? t("hideSettings")
                    : t("manage")
                  : t("connect")}
              </Button>
              {isConnected ? (
                <label className="flex h-9 items-center gap-2 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 text-sm">
                  <Switch
                    checked={status.enabled}
                    disabled={togglePending}
                    onCheckedChange={toggleEnabled}
                    aria-label={t("enableAria")}
                  />
                  <span className="text-muted-foreground">
                    {status.enabled ? t("on") : t("off")}
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
            {t.rich("encryptionKeyMissing", {
              code: (chunks) => (
                <code className="font-mono text-xs">{chunks}</code>
              ),
            })}
          </p>
        </div>
      ) : null}

      {isConnected ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <StatCell label={t("destination")}>
              <DiscordLogo className="size-4" />
              {t("destinationValue")}
            </StatCell>
            <StatCell label={t("events")}>
              <span className="text-muted-foreground">
                {status.events.length === 0
                  ? t("noneSelected")
                  : t("subscribedCount", { count: status.events.length })}
              </span>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {canEdit ? (
        <InlineReveal open={open}>
          <DiscordConnectForm
            status={status}
            connected={isConnected}
            events={events}
            onSaved={() => router.refresh()}
          />
        </InlineReveal>
      ) : null}
    </div>
  );
}

function DiscordConnectForm({
  status,
  connected,
  events,
  onSaved,
}: {
  status: WorkspaceChatStatus;
  connected: boolean;
  events: EventOption[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selected, setSelected] = useState<string[]>(
    connected && status.events.length > 0
      ? status.events
      : events.map((e) => e.value),
  );
  const [enabled, setEnabled] = useState(connected ? status.enabled : true);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const t = useTranslations("features.workspaces.discordConnectPanel");

  function toggleEvent(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  const canTest = webhookUrl.trim().length > 0 || connected;

  function runTest() {
    startTest(async () => {
      const result = await sendTestChatAction({
        provider: "discord",
        webhookUrl: webhookUrl || undefined,
      });
      if (!result.ok) {
        toast.error(result.error ?? t("testFailed"));
        return;
      }
      toast.success(t("testSent"));
    });
  }

  function save() {
    startSave(async () => {
      const result = await saveChatSettingsAction({
        enabled,
        provider: "discord",
        webhookUrl: webhookUrl || undefined,
        events: selected,
      });
      if (!result.ok) {
        toast.error(result.error ?? t("couldNotSave"));
        return;
      }
      toast.success(t("settingsSaved"));
      onSaved();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disableChatAction();
      if (!result.ok) {
        toast.error(result.error ?? t("couldNotDisconnect"));
        return;
      }
      toast.success(t("disconnectedToast"));
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            {connected ? t("manageConnection") : t("connectDiscord")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("webhookNote")}
          </p>
        </div>
        <a
          href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          {t("webhookDocs")}
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="discord-webhook">{t("webhookUrlLabel")}</Label>
          <SecretInput
            id="discord-webhook"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder={
              connected
                ? t("webhookUrlStoredPlaceholder")
                : "https://discord.com/api/webhooks/000/xxxx"
            }
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            {t("webhookSetupHelp")}
          </p>
        </div>

        <div className="space-y-2">
          <Label>{t("notifyOn")}</Label>
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

        <SettingRow
          htmlFor="discordconnectpanel-switch-1"
          className="rounded-[var(--radius-inner)] border border-hairline px-4 py-3"
          title={t("enableTitle")}
          description={t("enableDescription")}
          control={<Switch id="discordconnectpanel-switch-1" checked={enabled} onCheckedChange={setEnabled} />}
        />
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
        {connected ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={disconnect}
            disabled={disconnecting}
          >
            {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
            {t("disconnect")}
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
            {t("sendTest")}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            {t("save")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
