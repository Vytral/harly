"use client";

import { IntegrationHealthNotice } from "@/features/integrations/health/ui/IntegrationHealthNotice";
import type { IntegrationHealthView } from "@/features/integrations/health/model";
import { providerStatusLabel, providerStatusTone } from "@/features/integrations/health/connection-label";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import {
  disconnectEsignAction,
  saveEsignSettingsAction,
  testEsignAction,
} from "@/features/workspaces/esign-settings-actions";
import type { WorkspaceEsignStatus } from "@/lib/esign/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import { DocuSealLogo } from "@/components/ui/icons/brands";
import {
  ArrowUpRightIcon,
  GearSixIcon,
  KeyDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SecretInput } from "@/components/ui/secret-input";
import { Label } from "@/components/ui/label";

/**
 * DocuSeal (self-hosted e-signature). BYO instance URL + API token (encrypted at
 * rest). A webhook secret is generated on save; the admin pastes the shown
 * webhook URL and configures the secret as X-DocuSeal-Secret.
 */
export function EsignConnectPanel({
  status,
  canEdit,
  webhookUrl,
  webhookSecret,
  tileClassName,
  description,
  health,
}: {
  health?: IntegrationHealthView;
  status: WorkspaceEsignStatus;
  canEdit: boolean;
  /** Inbound webhook URL with workspace selector only (`?ws=`), or null. */
  webhookUrl: string | null;
  /** Shared secret sent as X-DocuSeal-Secret, never put in the URL. */
  webhookSecret: string | null;
  tileClassName: string;
  description: string;
}) {
  const t = useTranslations("features.workspaces.esignConnectPanel");
  const router = useRouter();
  const connected = status.enabled && status.hasToken;
  const [open, setOpen] = useState(false);
  const [testing, startTest] = useTransition();

  function testConnection() {
    startTest(async () => {
      const result = await testEsignAction();
      if (result.ok) toast.success(t("connectionWorking"));
      else {
        toast.error(result.error ?? t("testFailed"));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={DocuSealLogo}
        tileClassName={tileClassName}
        name="DocuSeal"
        description={description}
        statusLabel={providerStatusLabel(health, connected ? t("connected") : t("notConnected"))}
        statusTone={providerStatusTone(health, connected ? "on" : "neutral")}
        action={
          canEdit ? (
            <Button
              variant={connected ? "outline" : "default"}
              disabled={!status.encryptionReady}
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              {connected ? <GearSixIcon className="size-4" /> : <KeyDuotoneIcon className="size-4" />}
              {connected ? (open ? t("hideSettings") : t("manage")) : t("connect")}
            </Button>
          ) : null
        }
      />
      {health ? <IntegrationHealthNotice health={health} onReconnect={() => setOpen(true)} /> : null}

      {!status.encryptionReady && !connected ? (
        <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            {t.rich("encryptionWarning", {
              code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
            })}
          </p>
        </div>
      ) : null}

      {connected ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <StatCell label={t("instance")}>
              <DocuSealLogo className="size-4" />
              <span className="truncate">{status.url ?? t("connected")}</span>
            </StatCell>
            <StatCell label={t("status")}>
              <button type="button" onClick={testConnection} disabled={testing} className="flex items-center gap-1.5 text-sm font-medium text-pine hover:underline disabled:opacity-50">
                {testing ? <SpinnerIcon className="size-3.5" /> : null}
                {testing ? t("testing") : t("testConnection")}
              </button>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {canEdit ? (
        <InlineReveal open={open}>
          {connected ? (
            <Card className="space-y-4 p-5">
              {webhookUrl ? (
                <div className="space-y-2 border-t pt-4">
                  <h2 className="font-display text-base font-semibold tracking-tight">{t("webhook")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t.rich("webhookInstructions", {
                      code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
                    })}
                  </p>
                  <code className="block break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">{webhookUrl}</code>
                  {webhookSecret ? (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-foreground">{t("authHeader")}</p>
                      <code className="block break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">X-DocuSeal-Secret: {webhookSecret}</code>
                      <p className="text-xs text-muted-foreground">
                        {t.rich("secretHeaderHelp", {
                          code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
                        })}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <ConnectForm status={status} onSaved={() => { setOpen(false); router.refresh(); }} />
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() =>
                  startTest(async () => {
                    const result = await disconnectEsignAction();
                    if (!result.ok) {
                      toast.error(result.error ?? t("disconnectFailed"));
                      return;
                    }
                    toast.success(t("disconnected"));
                    router.refresh();
                  })
                }
                disabled={testing}
              >
                {t("disconnect")}
              </Button>
            </Card>
          ) : (
            <ConnectForm status={status} onSaved={() => { setOpen(false); router.refresh(); }} />
          )}
        </InlineReveal>
      ) : null}
    </div>
  );
}

function ConnectForm({
  status,
  onSaved,
}: {
  status: WorkspaceEsignStatus;
  onSaved: () => void;
}) {
  const t = useTranslations("features.workspaces.esignConnectForm");
  const [url, setUrl] = useState(status.url ?? "");
  const [apiToken, setApiToken] = useState("");
  const [enabled, setEnabled] = useState(status.enabled || !status.hasToken);
  const [saving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      const result = await saveEsignSettingsAction({
        url,
        apiToken: apiToken || undefined,
        enabled,
      });
      if (!result.ok) {
        toast.error(result.error ?? t("saveFailed"));
        return;
      }
      toast.success(t("saved"));
      onSaved();
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            {status.hasToken ? t("manageConnection") : t("connectDocuSeal")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <a
          href="https://www.docuseal.com/docs/api"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          {t("docsLink")}
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="docuseal-url">{t("instanceUrl")}</Label>
          <Input
            id="docuseal-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://sign.yourcompany.com"
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">{t("instanceUrlHelp")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="docuseal-token">{t("apiToken")}</Label>
          <SecretInput
            id="docuseal-token"
            value={apiToken}
            onChange={(event) => setApiToken(event.target.value)}
            placeholder={status.hasToken ? t("storedPlaceholder") : t("tokenPlaceholder")}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">{t("apiTokenHelp")}</p>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">{t("enable")}</p>
            <p className="text-xs text-muted-foreground">{t("enableDescription")}</p>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="size-4 accent-pine"
            aria-label={t("enable")}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={save} disabled={saving || !url.trim() || (!apiToken.trim() && !status.hasToken)}>
          {saving ? <SpinnerIcon className="size-4" /> : null}
          {t("save")}
        </Button>
      </div>
    </Card>
  );
}
