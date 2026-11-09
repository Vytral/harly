"use client";

import { IntegrationHealthNotice } from "@/features/integrations/health/ui/IntegrationHealthNotice";
import type { IntegrationHealthView } from "@/features/integrations/health/model";
import { providerStatusLabel, providerStatusTone } from "@/features/integrations/health/connection-label";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import {
  disconnectJitsiAction,
  saveJitsiSettingsAction,
  testJitsiConnectionAction,
} from "@/features/workspaces/jitsi-settings-actions";
import type { WorkspaceJitsiStatus } from "@/lib/jitsi/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import { TheSvgLogo } from "@/components/ui/icons/brands";
import {
  ArrowUpRightIcon,
  CheckCircleIcon,
  GearSixIcon,
  KeyDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";

function JitsiLogo({ className }: { className?: string }) {
  return <TheSvgLogo slug="jitsi" alt="Jitsi" className={className} />;
}

type TestState =
  | { kind: "idle" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export function JitsiConnectPanel({
  status,
  canEdit,
  tileClassName,
  description,
  health,
}: {
  health?: IntegrationHealthView;
  status: WorkspaceJitsiStatus;
  canEdit: boolean;
  tileClassName: string;
  description: string;
}) {
  const t = useTranslations("features.workspaces.jitsiConnectPanel");
  const router = useRouter();
  const isConfigured = Boolean(status.baseUrl);
  const [open, setOpen] = useState(isConfigured);
  const [togglePending, startToggle] = useTransition();

  const statusTone = providerStatusTone(health, isConfigured
    ? status.enabled
      ? "on"
      : "off"
    : "neutral");
  const statusLabel = providerStatusLabel(health, isConfigured
    ? status.enabled
      ? t("statusConnected")
      : t("statusDisabled")
    : t("statusNotConnected"));

  function toggleEnabled(next: boolean) {
    if (!status.baseUrl) {
      toast.error(t("addInstanceUrlFirst"));
      return;
    }
    startToggle(async () => {
      const result = await saveJitsiSettingsAction({
        enabled: next,
        baseUrl: status.baseUrl!,
      });
      if (!result.ok) {
        toast.error(result.error ?? t("updateFailed"));
        return;
      }
      toast.success(next ? t("jitsiEnabled") : t("jitsiDisabled"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={JitsiLogo}
        logoClassName="size-9"
        tileClassName={tileClassName}
        name="Jitsi Meet"
        description={description}
        statusLabel={statusLabel}
        statusTone={statusTone}
        action={
          canEdit ? (
            <>
              <Button
                variant={isConfigured ? "outline" : "default"}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                {isConfigured ? (
                  <GearSixIcon className="size-4" />
                ) : (
                  <KeyDuotoneIcon className="size-4" />
                )}
                {isConfigured ? (open ? t("hideSettings") : t("manage")) : t("connect")}
              </Button>
              {isConfigured ? (
                <label className="flex h-9 items-center gap-2 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 text-sm">
                  <Switch
                    checked={status.enabled}
                    disabled={togglePending}
                    onCheckedChange={toggleEnabled}
                    aria-label={t("enableSwitchLabel")}
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

      {isConfigured ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <StatCell label={t("instance")}>
              <JitsiLogo className="size-4" />
              <span className="truncate">{status.baseUrl}</span>
            </StatCell>
            <StatCell label={t("rooms")}>
              <span className="text-muted-foreground">
                {t("roomsValue")}
              </span>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {canEdit ? (
        <InlineReveal open={open}>
          <JitsiConnectForm
            status={status}
            onSaved={() => router.refresh()}
          />
        </InlineReveal>
      ) : null}
    </div>
  );
}

function JitsiConnectForm({
  status,
  onSaved,
}: {
  status: WorkspaceJitsiStatus;
  onSaved: () => void;
}) {
  const t = useTranslations("features.workspaces.jitsiConnectPanel");
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(status.baseUrl ?? "");
  const [enabled, setEnabled] = useState(status.enabled || !status.baseUrl);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const isPublicInstance = baseUrl.trim().replace(/\/+$/, "") === "https://meet.jit.si";

  function testConnection() {
    startTest(async () => {
      setTest({ kind: "idle" });
      const result = await testJitsiConnectionAction({
        baseUrl: baseUrl || undefined,
      });
      if (result.ok) {
        setTest({ kind: "ok" });
        toast.success(t("reachable"));
      } else {
        setTest({
          kind: "error",
          message: result.error ?? t("unreachable"),
        });
      }
    });
  }

  function save() {
    startSave(async () => {
      const result = await saveJitsiSettingsAction({ enabled, baseUrl });
      if (!result.ok) {
        toast.error(result.error ?? t("saveFailed"));
        return;
      }
      toast.success(t("settingsSaved"));
      onSaved();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectJitsiAction();
      if (!result.ok) {
        toast.error(result.error ?? t("disconnectFailed"));
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
            {status.baseUrl ? t("manageConnection") : t("connectTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("intro")}
          </p>
        </div>
        <a
          href="https://jitsi.github.io/handbook/docs/devops-guide/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          {t("selfHostGuide")}
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="jitsi-base">{t("instanceBaseUrl")}</Label>
          <Input
            id="jitsi-base"
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setTest({ kind: "idle" });
            }}
            placeholder="https://meet.jit.si"
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            {t("instanceHelp")}
          </p>
        </div>

        {isPublicInstance ? (
          <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              {t("publicInstanceWarning")}
            </p>
          </div>
        ) : null}

        <SettingRow
          htmlFor="jitsiconnectpanel-switch-1"
          className="rounded-[var(--radius-inner)] border border-hairline px-4 py-3"
          title={t("enableTitle")}
          description={t("enableDescription")}
          control={<Switch id="jitsiconnectpanel-switch-1" checked={enabled} onCheckedChange={setEnabled} />}
        />

        {test.kind === "error" ? (
          <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
            <p>{test.message}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
        {status.baseUrl ? (
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
            onClick={testConnection}
            disabled={testing || !baseUrl.trim()}
          >
            {testing ? (
              <SpinnerIcon className="size-4" />
            ) : test.kind === "ok" ? (
              <CheckCircleIcon className="size-4 text-pine" />
            ) : null}
            {test.kind === "ok" ? t("instanceOk") : t("testConnection")}
          </Button>
          <Button onClick={save} disabled={saving || !baseUrl.trim()}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            {t("save")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
