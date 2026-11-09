"use client";

import { IntegrationHealthNotice } from "@/features/integrations/health/ui/IntegrationHealthNotice";
import type { IntegrationHealthView } from "@/features/integrations/health/model";
import { providerStatusLabel, providerStatusTone } from "@/features/integrations/health/connection-label";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import {
  saveZoomCredentialsAction,
  testZoomConnectionAction,
  uninstallZoom,
} from "@/features/workspaces/zoom-settings-actions";
import type { ZoomConfig } from "@/lib/zoom/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import { ZoomLogo } from "@/components/ui/icons/brands";
import {
  ArrowUpRightIcon,
  GearSixIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SecretInput } from "@/components/ui/secret-input";
import { Label } from "@/components/ui/label";

export function ZoomConnectPanel({
  config,
  canEdit,
  workspaceId,
  tileClassName,
  description,
  health,
}: {
  health?: IntegrationHealthView;
  config: ZoomConfig;
  canEdit: boolean;
  workspaceId: string;
  tileClassName: string;
  description: string;
}) {
  const t = useTranslations("features.workspaces.zoomConnectPanel");
  const router = useRouter();
  const isConnected = health
    ? health.connected
    : config.installationState === "installed";
  const [testing, setTesting] = useState(false);
  // Show the credentials form up-front only when nothing is configured yet.
  const [open, setOpen] = useState(!config.configured && !isConnected);
  const [disconnecting, startDisconnect] = useTransition();

  const installUrl = `/api/integrations/zoom/install?ws=${workspaceId}`;

  const statusTone = providerStatusTone(health, isConnected ? "on" : "neutral");
  const statusLabel = providerStatusLabel(health, isConnected ? t("connected") : t("notConnected"));

  function disconnect() {
    startDisconnect(async () => {
      const result = await uninstallZoom();
      if (!result.success) {
        toast.error(result.error ?? t("couldNotDisconnect"));
        return;
      }
      toast.success(t("disconnected"));
      router.refresh();
    });
  }

  async function testConnection() {
    setTesting(true);
    const result = await testZoomConnectionAction();
    setTesting(false);
    if (result.success) {
      toast.success(t("connectionWorking"));
    } else {
      toast.error(result.error ?? t("connectionTestFailed"));
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={ZoomLogo}
        tileClassName={tileClassName}
        name="Zoom"
        description={description}
        statusLabel={statusLabel}
        statusTone={statusTone}
        action={
          canEdit ? (
            isConnected ? null : (
              <Button
                onClick={() => setOpen((v) => !v)}
                disabled={!config.encryptionReady}
                aria-expanded={open}
              >
                {config.configured ? (
                  <GearSixIcon className="size-4" />
                ) : (
                  <ZoomLogo className="size-4" />
                )}
                {config.configured
                  ? open
                    ? t("hideSettings")
                    : t("manage")
                  : t("setUp")}
              </Button>
            )
          ) : null
        }
      />
      {health ? <IntegrationHealthNotice health={health} reconnectHref={installUrl} /> : null}

      {!config.encryptionReady && !isConnected ? (
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
          <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <StatCell label={t("account")}>
              <ZoomLogo className="size-4" />
              {config.accountEmail ?? t("notConnected")}
            </StatCell>
            <StatCell label={t("dashboard")}>
              <a
                href="https://zoom.us/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-pine transition-colors hover:text-pine-strong"
              >
                {t("zoomProfile")}
                <ArrowUpRightIcon className="size-3.5" />
              </a>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {isConnected && canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={testConnection}
            disabled={testing}
          >
            {testing ? t("testing") : t("testConnection")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={disconnect}
            disabled={disconnecting}
          >
            {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
            {t("disconnectZoom")}
          </Button>
        </div>
      ) : null}

      {canEdit && !isConnected ? (
        <InlineReveal open={open}>
          <ZoomCredentialsForm
            installUrl={installUrl}
            configured={config.configured}
          />
        </InlineReveal>
      ) : null}
    </div>
  );
}

function ZoomCredentialsForm({
  installUrl,
  configured,
}: {
  installUrl: string;
  configured: boolean;
}) {
  const t = useTranslations("features.workspaces.zoomConnectPanel");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, startSave] = useTransition();

  // Save credentials, then go straight to OAuth. On return the workspace is
  // connected — no second click. A hard redirect (not router.push) so the
  // server-side install route runs. When already configured and the fields are
  // left blank, skip the save and connect with the stored credentials.
  function saveAndConnect() {
    startSave(async () => {
      const hasNewCreds = Boolean(clientId.trim() && clientSecret.trim());
      if (hasNewCreds) {
        const result = await saveZoomCredentialsAction({ clientId, clientSecret });
        if (!result.success) {
          toast.error(result.error ?? t("couldNotSave"));
          return;
        }
      }
      window.location.href = installUrl;
    });
  }

  const bothFilled = Boolean(clientId.trim() && clientSecret.trim());
  const partiallyFilled =
    Boolean(clientId.trim()) !== Boolean(clientSecret.trim());
  // Connect is allowed when new creds are complete, or when already configured
  // and both fields are untouched (reuse the stored secret).
  const canConnect = bothFilled || (configured && !clientId && !clientSecret);

  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/integrations/zoom/callback`
      : "";

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            {configured ? t("manageZoom") : t("setUp")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {configured
              ? t("savedCredentialsDescription")
              : t("newCredentialsDescription")}
          </p>
        </div>
        <a
          href="https://marketplace.zoom.us/user/build"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          {t("zoomMarketplace")}
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">
            {t("howToGetCredentials")}
          </p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              {t.rich("stepOpenMarketplace", {
                link: (chunks) => (
                  <a
                    href="https://marketplace.zoom.us/user/build"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {chunks}
                  </a>
                ),
                b: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
              })}
            </li>
            <li>
              {t.rich("stepOAuthRedirect", {
                b: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
                em: (chunks) => <em>{chunks}</em>,
                newline: (chunks) => (
                  <>
                    <br />
                    {chunks}
                  </>
                ),
                code: (chunks) => <code className="break-all">{chunks}</code>,
                redirectUrl,
              })}
            </li>
            <li>
              {t.rich("stepScopes", {
                b: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
                code: (chunks) => <code>{chunks}</code>,
              })}
            </li>
            <li>
              {t.rich("stepCopyCredentials", {
                b: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
              })}
            </li>
            <li>
              {t.rich("stepConnect", {
                b: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
              })}
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label htmlFor="zoom-client-id">{t("clientId")}</Label>
          <Input
            id="zoom-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={configured ? t("savedIdPlaceholder") : t("idPlaceholder")}
            autoComplete="off"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="zoom-client-secret">{t("clientSecret")}</Label>
          <SecretInput
            id="zoom-client-secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={
              configured
                ? t("savedSecretPlaceholder")
                : t("secretPlaceholder")
            }
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            {t("secretHint")}
          </p>
        </div>

        {partiallyFilled ? (
          <p className="text-xs text-clay">
            {t("partialCredentials")}
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={saveAndConnect} disabled={saving || !canConnect}>
          {saving ? <SpinnerIcon className="size-4" /> : <ZoomLogo className="size-4" />}
          {t("connectZoom")}
        </Button>
      </div>
    </Card>
  );
}
