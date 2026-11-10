"use client";

import { IntegrationHealthNotice } from "@/features/integrations/health/ui/IntegrationHealthNotice";
import {
  sanitizeIntegrationError,
  type IntegrationHealthView,
} from "@/features/integrations/health/model";
import { providerStatusLabel, providerStatusTone } from "@/features/integrations/health/connection-label";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import {
  disconnectSlackAction,
  listSlackDeliveriesAction,
  listSlackChannelsAction,
  replaySlackDeliveryAction,
  saveSlackCredentialsAction,
  saveSlackSettingsAction,
  testSlackAction,
  type SlackChannel,
  type SlackDeliveryView,
} from "@/features/workspaces/slack-settings-actions";
import type { WorkspaceSlackStatus } from "@/lib/slack/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import { SlackLogo } from "@/components/ui/icons/brands";
import {
  ArrowUpRightIcon,
  GearSixIcon,
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

export function SlackConnectPanel({
  status,
  events,
  canEdit,
  workspaceId,
  tileClassName,
  description,
  health,
}: {
  health?: IntegrationHealthView;
  status: WorkspaceSlackStatus;
  events: EventOption[];
  canEdit: boolean;
  workspaceId: string;
  tileClassName: string;
  description: string;
}) {
  const t = useTranslations("features.workspaces.slackConnectPanel");
  const router = useRouter();
  const isConnected = status.hasToken;
  const [open, setOpen] = useState(isConnected || !status.hasCredentials);
  const [togglePending, startToggle] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const statusTone = providerStatusTone(health, isConnected ? (status.enabled ? "on" : "off") : "neutral");
  const statusLabel = providerStatusLabel(health, isConnected
    ? status.enabled
      ? t("connected")
      : t("disabled")
    : t("notConnected"));

  const installUrl = `/api/integrations/slack/install?ws=${workspaceId}`;

  function toggleEnabled(next: boolean) {
    if (!isConnected) return;
    if (next && !status.channelId) {
      toast.error(t("selectChannelFirst"));
      return;
    }
    startToggle(async () => {
      const result = await saveSlackSettingsAction({
        enabled: next,
        channelId: status.channelId ?? "",
        channelName: status.channelName ?? "",
        events: status.events,
      });
      if (!result.ok) {
        toast.error(result.error ?? t("couldNotUpdate"));
        return;
      }
      toast.success(next ? t("notificationsOn") : t("notificationsOff"));
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectSlackAction();
      if (!result.ok) {
        toast.error(result.error ?? t("couldNotDisconnect"));
        return;
      }
      toast.success(t("disconnected"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={SlackLogo}
        tileClassName={tileClassName}
        name="Slack"
        description={description}
        statusLabel={statusLabel}
        statusTone={statusTone}
        action={
          canEdit ? (
            isConnected ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                >
                  <GearSixIcon className="size-4" />
                  {open ? t("hideSettings") : t("manage")}
                </Button>
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
              </>
            ) : status.hasCredentials ? (
              <Button asChild>
                <a href={installUrl}>
                  <SlackLogo className="size-4" />
                  {t("addToSlack")}
                </a>
              </Button>
            ) : (
              <Button
                onClick={() => setOpen((v) => !v)}
                disabled={!status.encryptionReady}
                aria-expanded={open}
              >
                <SlackLogo className="size-4" />
                {t("setUp")}
              </Button>
            )
          ) : null
        }
      />
      {health ? <IntegrationHealthNotice health={health} reconnectHref={installUrl} /> : null}

      {!status.encryptionReady && !isConnected ? (
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
            <StatCell label={t("workspace")}>
              <SlackLogo className="size-4" />
              {status.teamName ?? t("notConnected")}
            </StatCell>
            <StatCell label={t("channel")}>
              {status.channelName ? `#${status.channelName}` : t("notSelected")}
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

      {isConnected && status.lastDelivery ? (
        <Card className="p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{t("deliveryHealth")}</span>
            <span className="text-muted-foreground">
              {status.lastDelivery.status === "success"
                ? t("healthy")
                : status.lastDelivery.status === "dead_letter"
                  ? t("actionRequired")
                  : t("retrying")}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.pendingDeliveries > 0
              ? t("pendingNotifications", { count: status.pendingDeliveries })
              : t("lastDeliveryAttempt", { attempts: status.lastDelivery.attempts })}
            {status.lastDelivery.error ? ` ${sanitizeIntegrationError(status.lastDelivery.error)}` : ""}
          </p>
        </Card>
      ) : null}

      {canEdit ? (
        <InlineReveal open={open}>
          {isConnected ? (
            <SlackConfigForm
              status={status}
              events={events}
              onSaved={() => router.refresh()}
              onDisconnect={disconnect}
              disconnecting={disconnecting}
            />
          ) : !status.hasCredentials ? (
            <SlackCredentialsForm onSaved={() => router.refresh()} />
          ) : null}
        </InlineReveal>
      ) : null}
    </div>
  );
}

function SlackCredentialsForm({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("features.workspaces.slackConnectPanel");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      const result = await saveSlackCredentialsAction({ clientId, clientSecret });
      if (!result.ok) {
        toast.error(result.error ?? t("couldNotSave"));
        return;
      }
      toast.success(t("credentialsSaved"));
      onSaved();
    });
  }

  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/integrations/slack/callback`
      : "";

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            {t("setUpIntegration")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("credentialsDescription")}
          </p>
        </div>
        <a
          href="https://api.slack.com/apps"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          {t("slackApps")}
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">{t("howToGetCredentials")}</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              {t.rich("stepCreateApp", {
                link: (chunks) => (
                  <a
                    href="https://api.slack.com/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </li>
            <li>
              {t.rich("stepScopes", {
                code: (chunks) => <code>{chunks}</code>,
              })}
            </li>
            <li>
              {t.rich("stepRedirectUrl", {
                code: (chunks) => <code>{chunks}</code>,
                redirectUrl,
              })}
            </li>
            <li>{t("stepCopyCredentials")}</li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label htmlFor="slack-client-id">{t("clientId")}</Label>
          <Input
            id="slack-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={t("clientIdPlaceholder")}
            autoComplete="off"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slack-client-secret">{t("clientSecret")}</Label>
          <SecretInput
            id="slack-client-secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={t("clientSecretPlaceholder")}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            {t("secretHint")}
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={save}
          disabled={saving || !clientId.trim() || !clientSecret.trim()}
        >
          {saving ? <SpinnerIcon className="size-4" /> : null}
          {t("saveCredentials")}
        </Button>
      </div>
    </Card>
  );
}

function SlackConfigForm({
  status,
  events,
  onSaved,
  onDisconnect,
  disconnecting,
}: {
  status: WorkspaceSlackStatus;
  events: EventOption[];
  onSaved: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const t = useTranslations("features.workspaces.slackConnectPanel");
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [loadingChannels, startLoadChannels] = useTransition();
  const [channelId, setChannelId] = useState(status.channelId ?? "");
  const [channelName, setChannelName] = useState(status.channelName ?? "");
  const [selected, setSelected] = useState<string[]>(
    status.events.length > 0 ? status.events : events.map((e) => e.value),
  );
  const [enabled, setEnabled] = useState(status.enabled);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const [loaded, setLoaded] = useState(false);
  const [deliveries, setDeliveries] = useState<SlackDeliveryView[]>([]);
  const [loadingDeliveries, startLoadDeliveries] = useTransition();
  const [replaying, setReplaying] = useState<string | null>(null);

  function loadChannels() {
    startLoadChannels(async () => {
      const result = await listSlackChannelsAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setChannels(result.channels);
      setLoaded(true);
    });
  }

  function selectChannel(id: string) {
    setChannelId(id);
    const ch = channels.find((c) => c.id === id);
    setChannelName(ch?.name ?? "");
  }

  function toggleEvent(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function runTest() {
    startTest(async () => {
      const result = await testSlackAction();
      if (!result.ok) {
        toast.error(result.error ?? t("testFailed"));
        return;
      }
      toast.success(t("testSent"));
    });
  }

  function loadDeliveries() {
    startLoadDeliveries(async () => {
      const result = await listSlackDeliveriesAction();
      if (!result.ok) toast.error(result.error);
      else setDeliveries(result.deliveries);
    });
  }

  function replay(id: string) {
    setReplaying(id);
    void replaySlackDeliveryAction(id).then((result) => {
      if (!result.ok) toast.error(result.error ?? t("couldNotReplay"));
      else {
        toast.success(t("replayQueued"));
        loadDeliveries();
      }
      setReplaying(null);
    });
  }

  function save() {
    if (!channelId) {
      toast.error(t("selectChannelFirst"));
      return;
    }
    startSave(async () => {
      const result = await saveSlackSettingsAction({
        enabled,
        channelId,
        channelName,
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

  return (
    <Card className="p-6">
      <div className="mb-5 space-y-0.5">
        <h2 className="font-display text-base font-semibold tracking-tight">
          {t("configureSlack")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("configureDescription", { teamName: status.teamName ?? "Slack" })}
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label>{t("channel")}</Label>
          {!loaded ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={loadChannels}
              disabled={loadingChannels}
            >
              {loadingChannels ? <SpinnerIcon className="size-4" /> : null}
              {t("loadChannels")}
            </Button>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
              {channels.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  {t("noChannels")}
                </p>
              ) : (
                channels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => selectChannel(ch.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                      channelId === ch.id
                        ? "bg-sage font-medium text-sage-ink"
                        : "hover:bg-muted",
                    )}
                  >
                    <span className="text-muted-foreground">#</span>
                    {ch.name}
                  </button>
                ))
              )}
            </div>
          )}
          {channelName && (
            <p className="text-xs text-muted-foreground">
              {t.rich("selectedChannel", {
                b: (chunks) => <span className="font-medium">{chunks}</span>,
                channelName,
              })}
            </p>
          )}
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
          htmlFor="slackconnectpanel-switch-1"
          className="rounded-[var(--radius-inner)] border border-hairline px-4 py-3"
          title={t("enable")}
          description={t("whenOffNoPosts")}
          control={<Switch id="slackconnectpanel-switch-1" checked={enabled} onCheckedChange={setEnabled} />}
        />
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
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={runTest}
            disabled={testing || !status.channelId}
          >
            {testing ? (
              <SpinnerIcon className="size-4" />
            ) : (
              <PaperPlaneDuotoneIcon className="size-4" />
            )}
            {t("sendTest")}
          </Button>
          <Button onClick={save} disabled={saving || !channelId}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            {t("save")}
          </Button>
        </div>
      </div>

      <div className="mt-5 border-t pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{t("recentDeliveries")}</p>
            <p className="text-xs text-muted-foreground">
              {t("deliveriesDescription")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadDeliveries} disabled={loadingDeliveries}>
            {loadingDeliveries ? <SpinnerIcon className="size-3.5" /> : null}
            {t("loadHistory")}
          </Button>
        </div>
        {deliveries.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {deliveries.map((delivery) => (
              <div key={delivery.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium">{delivery.event}</p>
                  <p className="text-muted-foreground">
                    {delivery.lastError
                      ? t("deliveryAttemptsWithError", {
                          status: delivery.status,
                          count: delivery.attempts,
                          error: sanitizeIntegrationError(delivery.lastError),
                        })
                      : t("deliveryAttempts", {
                          status: delivery.status,
                          count: delivery.attempts,
                        })}
                  </p>
                </div>
                {delivery.status === "dead_letter" || delivery.status === "failed" ? (
                  <Button size="sm" variant="outline" onClick={() => replay(delivery.id)} disabled={replaying === delivery.id}>
                    {replaying === delivery.id ? <SpinnerIcon className="size-3.5" /> : null}
                    {t("replay")}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
