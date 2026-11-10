"use client";

import { IntegrationHealthNotice } from "@/features/integrations/health/ui/IntegrationHealthNotice";
import type { IntegrationHealthView } from "@/features/integrations/health/model";
import { providerStatusLabel, providerStatusTone } from "@/features/integrations/health/connection-label";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { SecretInput } from "@/components/ui/secret-input";
import { Label } from "@/components/ui/label";
import { SettingRow } from "@/components/ui/setting-row";
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
  health,
}: {
  health?: IntegrationHealthView;
  status: WorkspaceTelegramStatus;
  events: EventOption[];
  canEdit: boolean;
  tileClassName: string;
  description: string;
}) {
  const t = useTranslations("features.workspaces.telegramConnectPanel");
  const router = useRouter();
  const isConnected = status.hasToken;
  const [open, setOpen] = useState(isConnected);
  const [togglePending, startToggle] = useTransition();

  const statusTone = providerStatusTone(health, isConnected ? (status.enabled ? "on" : "off") : "neutral");
  const statusLabel = providerStatusLabel(health, isConnected
    ? status.enabled
      ? t("connected")
      : t("disabled")
    : t("notConnected"));

  function toggleEnabled(next: boolean) {
    if (!isConnected) return;
    if (next && !status.chatId) {
      toast.error(t("addChatIdFirst"));
      return;
    }
    startToggle(async () => {
      const result = await saveTelegramSettingsAction({
        enabled: next,
        chatId: status.chatId ?? "",
        events: status.events,
      });
      if (!result.ok) {
        toast.error(result.error ?? t("couldNotUpdate"));
        return;
      }
      toast.success(
        next ? t("notificationsOn") : t("notificationsOff"),
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
                {isConnected ? (open ? t("hideSettings") : t("manage")) : t("connect")}
              </Button>
              {isConnected ? (
                <label className="flex h-9 items-center gap-2 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 text-sm">
                  <Switch
                    checked={status.enabled}
                    disabled={togglePending}
                    onCheckedChange={toggleEnabled}
                    aria-label={t("enableNotificationsAria")}
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
      {health ? <IntegrationHealthNotice health={health} onReconnect={() => setOpen(true)} /> : null}

      {!status.encryptionReady ? (
        <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            {t.rich("encryptionKeyMissing", {
              code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
            })}
          </p>
        </div>
      ) : null}

      {isConnected ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatCell label={t("bot")}>
              <TelegramLogo className="size-4" />
              {status.botUsername ? `@${status.botUsername}` : providerStatusLabel(health, t("connected"))}
            </StatCell>
            <StatCell label={t("chat")}>
              <span className="font-mono text-[13px]">
                {status.chatId ?? t("notSet")}
              </span>
            </StatCell>
            <StatCell label={t("events")}>
              <span className="text-muted-foreground">
                {status.events.length === 0
                  ? t("noneSelected")
                  : t("eventsSubscribed", { count: status.events.length })}
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
  const t = useTranslations("features.workspaces.telegramConnectPanel");
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
        toast.error(result.error ?? t("testFailed"));
        return;
      }
      toast.success(t("testSent"));
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
        toast.error(result.error ?? t("couldNotSave"));
        return;
      }
      toast.success(t("settingsSaved"));
      onSaved();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectTelegramAction();
      if (!result.ok) {
        toast.error(result.error ?? t("couldNotDisconnect"));
        return;
      }
      toast.success(t("disconnected"));
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            {status.hasToken ? t("manageConnection") : t("connectTelegram")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("tokenDescription")}
          </p>
        </div>
        <a
          href="https://core.telegram.org/bots/features#botfather"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          {t("botFatherDocs")}
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>

      <div className="space-y-5">
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">{t("howToSetUp")}</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              {t.rich("stepBotFather", {
                code: (chunks) => <code>{chunks}</code>,
              })}
            </li>
            <li>{t("stepAddBot")}</li>
            <li>
              {t.rich("stepChatId", {
                code: (chunks) => <code>{chunks}</code>,
              })}
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tg-token">{t("botToken")}</Label>
          <SecretInput
            id="tg-token"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={
              status.hasToken
                ? t("tokenStoredPlaceholder")
                : "123456789:AAF3xkcyTgh…"
            }
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tg-chat">{t("chatIdLabel")}</Label>
          <Input
            id="tg-chat"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder={t("chatIdPlaceholder")}
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            {t("chatIdHint")}
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
          htmlFor="telegramconnectpanel-switch-1"
          className="rounded-[var(--radius-inner)] border border-hairline px-4 py-3"
          title={t("enable")}
          description={t("whenOffNoMessages")}
          control={<Switch id="telegramconnectpanel-switch-1" checked={enabled} onCheckedChange={setEnabled} />}
        />
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
          <Button onClick={save} disabled={saving || !chatId.trim()}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            {t("save")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
