"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ArrowsClockwiseIcon, DownloadDuotoneIcon } from "@/components/ui/icons/phosphor";
import { SectionHeader, StatCell, StatusPill, type PillTone } from "@/features/workspaces/settings-ui";

import {
  cancelUpdateRequestAction,
  checkForUpdatesAction,
  requestUpdateAction,
} from "./actions";
import {
  isActiveUpdateStatus,
  type UpdateStatus,
} from "./update-request-state";

export type UpdateRequestView = {
  id: string;
  status: UpdateStatus;
  trigger: "manual" | "auto";
  fromVersion: string;
  targetVersion: string;
  message: string | null;
  logTail: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type UpdatesView = {
  currentVersion: string;
  latestVersion: string | null;
  updateKind: "patch" | "minor" | "major" | null;
  notesUrl: string | null;
  notesSummary: string | null;
  lastCheckedAt: string | null;
  checkError: string | null;
  checkDisabled: boolean;
  updaterOnline: boolean;
  updaterLastSeenAt: string | null;
  active: UpdateRequestView | null;
  history: UpdateRequestView[];
  timezone: string;
};

const STATUS_TONE: Record<UpdateStatus, PillTone> = {
  pending: "warn",
  claimed: "warn",
  running: "warn",
  succeeded: "on",
  failed: "warn",
  rolled_back: "warn",
  cancelled: "off",
};

export function formatWhen(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

export function UpdatesPanel({ view }: { view: UpdatesView }) {
  const t = useTranslations("features.updates.updatesPanel");
  const tStatus = useTranslations("labels.updates.status");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const active = view.active;
  const updateAvailable = view.updateKind !== null && view.latestVersion !== null;

  // While an update is in flight, keep the page honest. The app restarts partway
  // through, so a failed refresh is expected and simply tried again.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [active, router]);

  function check() {
    startTransition(async () => {
      const result = await checkForUpdatesAction();
      if (!result.ok) toast.error(result.error);
      else toast.success(t("checkedToast"));
      router.refresh();
    });
  }

  async function install() {
    if (!view.latestVersion) return;
    const result = await requestUpdateAction(view.latestVersion);
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }
    toast.success(t("updateQueuedToast"));
    router.refresh();
  }

  function cancel(id: string) {
    startTransition(async () => {
      const result = await cancelUpdateRequestAction(id);
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  }

  const headline = active
    ? { tone: "warn" as const, text: tStatus(active.status) }
    : updateAvailable && view.latestVersion
      ? { tone: "warn" as const, text: t("updateAvailable", { version: view.latestVersion }) }
      : view.latestVersion
        ? { tone: "on" as const, text: t("upToDate") }
        : { tone: "neutral" as const, text: t("notChecked") };

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={DownloadDuotoneIcon}
        title={t("title")}
        description={t("description")}
        badge={<StatusPill tone={headline.tone}>{headline.text}</StatusPill>}
        action={
          <Button variant="outline" size="sm" onClick={check} disabled={pending || view.checkDisabled}>
            <ArrowsClockwiseIcon className="size-4" />
            {t("checkNow")}
          </Button>
        }
      />

      <div className="grid divide-y divide-hairline overflow-hidden rounded-[var(--radius-inner)] border border-hairline bg-card-inset sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <StatCell label={t("running")}>{view.currentVersion}</StatCell>
        <StatCell label={t("latestStable")}>{view.latestVersion ?? t("unknown")}</StatCell>
        <StatCell label={t("lastChecked")}>
          <span className="text-[13px] font-normal text-soft-ink">
            {view.lastCheckedAt ? formatWhen(view.lastCheckedAt, view.timezone, locale) : t("never")}
          </span>
        </StatCell>
      </div>

      {view.checkDisabled ? (
        <Callout tone="info" title={t("checksDisabledTitle")}>
          {t.rich("checksDisabled", { code: (chunks) => <code>{chunks}</code> })}
        </Callout>
      ) : view.checkError ? (
        <Callout tone="warning" title={t("checkErrorTitle")}>
          {t("checkError", { error: view.checkError })}
        </Callout>
      ) : null}

      {updateAvailable && view.latestVersion ? (
        <div className="space-y-3 rounded-[var(--radius-inner)] border border-hairline p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-near-ink">
                {view.updateKind === "major"
                  ? t("versionAvailableMajor", { version: view.latestVersion })
                  : t("versionAvailable", { version: view.latestVersion })}
              </p>
              {view.notesUrl ? (
                <a
                  href={view.notesUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[12.5px] text-soft-ink underline underline-offset-2 hover:text-near-ink"
                >
                  {t("readReleaseNotes")}
                </a>
              ) : null}
            </div>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={pending || active !== null || !view.updaterOnline}
            >
              {t("updateNow")}
            </Button>
          </div>
          {view.notesSummary ? (
            <p className="line-clamp-6 whitespace-pre-line text-[12.5px] leading-5 text-soft-ink">
              {view.notesSummary}
            </p>
          ) : null}
        </div>
      ) : null}

      {!view.updaterOnline ? (
        <Callout tone="warning" title={t("updaterOfflineTitle")}>
          {t.rich("updaterOffline", {
            lastSeen: view.updaterLastSeenAt ? "yes" : "no",
            when: view.updaterLastSeenAt ? formatWhen(view.updaterLastSeenAt, view.timezone, locale) : "",
            code: (chunks) => <code>{chunks}</code>,
          })}
        </Callout>
      ) : null}

      {active ? <ActiveRequest request={active} timezone={view.timezone} onCancel={cancel} busy={pending} /> : null}

      {view.history.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("recentUpdates")}
          </p>
          <ul className="divide-y divide-hairline rounded-[var(--radius-inner)] border border-hairline">
            {view.history.map((request) => (
              <li key={request.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-near-ink">
                    {request.fromVersion} → {request.targetVersion}
                    <span className="ml-2 text-[12.5px] text-soft-ink">
                      {request.trigger === "auto" ? t("automatic") : t("manual")}
                    </span>
                  </p>
                  <StatusPill tone={STATUS_TONE[request.status]}>
                    {tStatus(request.status)}
                  </StatusPill>
                </div>
                <p className="text-[12.5px] text-soft-ink">
                  {formatWhen(request.finishedAt ?? request.createdAt, view.timezone, locale)}
                  {request.message ? ` · ${request.message}` : ""}
                </p>
                {request.logTail && request.status !== "succeeded" ? (
                  <details className="text-[12.5px] text-soft-ink">
                    <summary className="cursor-pointer">{t("updaterLog")}</summary>
                    <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-card-inset p-3 text-[11.5px] leading-4">
                      {request.logTail}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="warning"
        title={t("updateDialogTitle", {
          version: view.latestVersion ?? t("latestVersionFallback"),
        })}
        description={t("updateDialogDescription")}
        confirmLabel={t("updateNow")}
        requireAck={t("acknowledge")}
        onConfirm={install}
      >
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-5 text-soft-ink">
          <li>{t.rich("backupStep", { code: (chunks) => <code>{chunks}</code> })}</li>
          <li>{t("downloadStep")}</li>
          <li>{t("rollbackStep")}</li>
        </ul>
      </ConfirmDialog>
    </Card>
  );
}

function ActiveRequest({
  request,
  timezone,
  onCancel,
  busy,
}: {
  request: UpdateRequestView;
  timezone: string;
  onCancel: (id: string) => void;
  busy: boolean;
}) {
  const t = useTranslations("features.updates.updatesPanel");
  const tStatus = useTranslations("labels.updates.status");
  const locale = useLocale();
  const message = request.message ?? t("waitingForUpdater");
  const when = formatWhen(request.createdAt, timezone, locale);

  return (
    <Callout
      tone="info"
      title={t("activeTitle", {
        status: tStatus(request.status),
        from: request.fromVersion,
        to: request.targetVersion,
      })}
    >
      <p>
        {isActiveUpdateStatus(request.status) && request.status !== "pending"
          ? t("activeDowntime", { message, when })
          : t("activeRequested", { message, when })}
      </p>
      {request.status === "pending" ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => onCancel(request.id)} disabled={busy}>
          {t("cancelRequest")}
        </Button>
      ) : null}
    </Callout>
  );
}
