"use client";

import { IntegrationHealthNotice } from "@/features/integrations/health/ui/IntegrationHealthNotice";
import type { IntegrationHealthView } from "@/features/integrations/health/model";
import { providerStatusLabel, providerStatusTone } from "@/features/integrations/health/connection-label";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import {
  disconnectOutlookAction,
  testOutlookAction,
} from "@/features/workspaces/outlook-settings-actions";
import type { WorkspaceOutlookStatus } from "@/lib/outlook/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import {
  MicrosoftTeamsLogo,
  MicrosoftOutlookLogo,
} from "@/components/ui/icons/brands";
import {
  ArrowUpRightIcon,
  GearSixIcon,
  SealCheckDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Microsoft Teams shares the Outlook OAuth connection (same token, same DB row,
 * same callback). This panel surfaces Teams' identity and reuses the Outlook
 * actions: connecting flips both cards, disconnecting clears both. Calendar
 * selection lives on the Outlook card.
 */
export function MicrosoftTeamsConnectPanel({
  status,
  canEdit,
  workspaceId,
  tileClassName,
  description,
  health,
}: {
  health?: IntegrationHealthView;
  status: WorkspaceOutlookStatus;
  canEdit: boolean;
  workspaceId: string;
  tileClassName: string;
  description: string;
}) {
  const t = useTranslations("features.workspaces.microsoftTeamsConnectPanel");
  const router = useRouter();
  const isConnected = status.hasToken;
  const [open, setOpen] = useState(isConnected);
  const [disconnecting, startDisconnect] = useTransition();
  const [testing, startTest] = useTransition();

  const statusTone = providerStatusTone(health, isConnected ? (status.enabled ? "on" : "off") : "neutral");
  const statusLabel = providerStatusLabel(health, isConnected
    ? status.enabled
      ? t("connected")
      : t("disabled")
    : t("notConnected"));

  const installUrl = `/api/integrations/outlook/install?ws=${workspaceId}`;

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectOutlookAction();
      if (!result.ok) {
        toast.error(result.error ?? t("disconnectFailed"));
        return;
      }
      toast.success(t("disconnected"));
      router.refresh();
    });
  }

  function testConnection() {
    startTest(async () => {
      const result = await testOutlookAction();
      if (result.ok) {
        toast.success(t("connectionWorking"));
      } else {
        toast.error(result.error ?? t("connectionFailed"));
      }
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={MicrosoftTeamsLogo}
        tileClassName={tileClassName}
        name="Microsoft Teams"
        description={description}
        statusLabel={statusLabel}
        statusTone={statusTone}
        action={
          canEdit ? (
            isConnected ? (
              <Button
                variant="outline"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                <GearSixIcon className="size-4" />
                {open ? t("hideSettings") : t("manage")}
              </Button>
            ) : status.hasCredentials ? (
              <Button asChild>
                <a href={installUrl}>
                  <MicrosoftOutlookLogo className="size-4" />
                  {t("connectMicrosoft")}
                </a>
              </Button>
            ) : (
              <Button disabled>
                <MicrosoftOutlookLogo className="size-4" />
                {t("credentialsNotSet")}
              </Button>
            )
          ) : null
        }
      />
      {health ? <IntegrationHealthNotice health={health} reconnectHref={installUrl} /> : null}

      {!status.hasCredentials && !isConnected ? (
        <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            {t.rich("credentialsHint", {
              code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
            })}
          </p>
        </div>
      ) : null}

      {isConnected ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatCell label={t("accountLabel")}>
              <MicrosoftOutlookLogo className="size-4" />
              {status.accountEmail ?? t("notConnected")}
            </StatCell>
            <StatCell label="Teams">
              {status.enabled ? (
                <>
                  <SealCheckDuotoneIcon className="size-3.5 text-pine" />
                  {t("ready")}
                </>
              ) : (
                t("notEnabled")
              )}
            </StatCell>
            <StatCell label={t("statusLabel")}>
              <button
                type="button"
                onClick={testConnection}
                disabled={testing}
                className="flex items-center gap-1.5 text-sm font-medium text-pine hover:underline disabled:opacity-50"
              >
                {testing ? (
                  <SpinnerIcon className="size-3.5" />
                ) : (
                  <SealCheckDuotoneIcon className="size-3.5" />
                )}
                {testing ? t("testing") : t("testConnection")}
              </button>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {isConnected && canEdit ? (
        <InlineReveal open={open}>
          <Card className="p-6">
            <div className="mb-5 space-y-0.5">
              <h2 className="font-display text-base font-semibold tracking-tight">
                Microsoft Teams
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("teamsDescription")}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
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
              <Button asChild size="sm" variant="outline">
                <Link href="/settings/integrations/outlook">
                  {t("manageCalendar")}
                  <ArrowUpRightIcon className="size-3.5" />
                </Link>
              </Button>
            </div>
          </Card>
        </InlineReveal>
      ) : null}
    </div>
  );
}
