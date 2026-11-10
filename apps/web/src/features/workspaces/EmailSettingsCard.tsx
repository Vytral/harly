"use client";

import { useState, useTransition } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import {
  disableEmailAction,
  saveEmailSettingsAction,
  sendTestEmailAction,
} from "@/features/workspaces/email-settings-actions";
import type { EmailProviderId, WorkspaceEmailStatus } from "@/lib/email/config";
import {
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { ResendLogo } from "@/components/ui/icons/brands";
import {
  KeyDuotoneIcon,
  PaperPlaneDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { EnvelopeIcon } from "@/components/ui/icons/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SecretInput } from "@/components/ui/secret-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";

const PROVIDER_LABEL: Record<EmailProviderId, string> = {
  resend: "Resend",
  smtp: "SMTP",
};

export function EmailSettingsCard({
  status,
  canEdit,
}: {
  status: WorkspaceEmailStatus;
  canEdit: boolean;
}) {
  const t = useTranslations("features.workspaces.emailSettingsCard");
  const router = useRouter();
  const [togglePending, startToggle] = useTransition();

  const isConfigured = Boolean(status.from);

  function toggleEnabled(next: boolean) {
    if (!isConfigured && next) {
      toast.error(t("configureFirst"));
      return;
    }
    startToggle(async () => {
      const result = next
        ? await saveEmailSettingsAction({
            enabled: true,
            provider: status.provider ?? "resend",
            from: status.from ?? "",
          })
        : await disableEmailAction();
      if (!result.ok) {
        toast.error(result.error ?? t("updateFailed"));
        return;
      }
      toast.success(next ? t("emailEnabled") : t("emailDisabled"));
      router.refresh();
    });
  }

  const badge = isConfigured ? (
    <StatusPill tone={status.enabled ? "on" : "off"}>
      {status.enabled ? t("statusConnected") : t("statusDisabled")}
    </StatusPill>
  ) : status.usingPlatformDefault ? (
    <StatusPill tone="neutral">{t("statusHarlyDefault")}</StatusPill>
  ) : (
    <StatusPill tone="neutral">{t("statusNotConnected")}</StatusPill>
  );

  return (
    <div className="space-y-5">
      {!status.encryptionReady ? <EncryptionWarning /> : null}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="p-6">
          <SectionHeader
            icon={EnvelopeIcon}
            title={t("title")}
            badge={badge}
            description={t("description")}
            action={
              canEdit ? (
                <>
                  {status.encryptionReady ? (
                    <Button asChild variant={isConfigured ? "outline" : "default"}>
                      <Link href={"/settings/email/configure" as Route}>
                        <KeyDuotoneIcon className="size-4" />
                        {isConfigured ? t("manage") : t("connect")}
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="default" disabled>
                      <KeyDuotoneIcon className="size-4" />
                      {t("connect")}
                    </Button>
                  )}
                  {isConfigured ? (
                    <label className="flex h-9 items-center gap-2 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 text-sm">
                      <Switch
                        checked={status.enabled}
                        disabled={togglePending}
                        onCheckedChange={toggleEnabled}
                        aria-label={t("enableAriaLabel")}
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
        </div>

        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <StatCell label={t("provider")}>
            {status.provider === "resend" ? (
              <ResendLogo className="size-3.5" />
            ) : (
              <EnvelopeIcon className="size-4 text-muted-foreground" />
            )}
            {PROVIDER_LABEL[status.provider!]}
          </StatCell>
          <StatCell label={t("fromAddress")}>
            <span className="truncate font-mono text-[13px]">
              {status.from}
            </span>
          </StatCell>
        </div>
      </Card>
    </div>
  );
}

function EncryptionWarning() {
  const t = useTranslations("features.workspaces.emailSettingsCard");
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
      <p>
        {t.rich("encryptionWarning", {
          code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
        })}
      </p>
    </div>
  );
}

export function EmailSettingsForm({ status }: {
  status: WorkspaceEmailStatus;
}) {
  const t = useTranslations("features.workspaces.emailSettingsForm");
  const router = useRouter();
  const [provider, setProvider] = useState<EmailProviderId>(
    status.provider ?? "resend",
  );
  const [from, setFrom] = useState(status.from ?? "");
  const [apiKey, setApiKey] = useState("");
  const [smtpHost, setSmtpHost] = useState(status.smtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(
    status.smtpPort ? String(status.smtpPort) : "",
  );
  const [smtpSecure, setSmtpSecure] = useState(status.smtpSecure);
  const [smtpUser, setSmtpUser] = useState(status.smtpUser ?? "");
  const [enabled, setEnabled] = useState(
    status.enabled || (!status.from && !status.hasSecret),
  );
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();

  function fieldsForAction() {
    return {
      provider,
      from,
      apiKey: apiKey || undefined,
      smtpHost: provider === "smtp" ? smtpHost || undefined : undefined,
      smtpPort: provider === "smtp" ? smtpPort || undefined : undefined,
      smtpSecure: provider === "smtp" ? smtpSecure : undefined,
      smtpUser: provider === "smtp" ? smtpUser || undefined : undefined,
    };
  }

  function runTest() {
    startTest(async () => {
      const result = await sendTestEmailAction(fieldsForAction());
      if (!result.ok) {
        toast.error(result.error ?? t("testFailed"));
        return;
      }
      toast.success(
        provider === "smtp" ? t("smtpVerified") : t("testEmailSent"),
      );
    });
  }

  function save() {
    startSave(async () => {
      const result = await saveEmailSettingsAction({
        ...fieldsForAction(),
        enabled,
      });
      if (!result.ok) {
        toast.error(result.error ?? t("couldNotSave"));
        return;
      }
      toast.success(t("saved"));
      router.refresh();
    });
  }

  const canTest =
    from.trim().length > 0 &&
    (provider === "resend"
      ? Boolean(apiKey || status.hasSecret)
      : smtpHost.trim().length > 0 && smtpPort.trim().length > 0);

  return (
    <DrawerLayout
      title={t("title")}
      description={t("description")}
      surface="page"
      footer={
        <Button onClick={save} disabled={saving || !from.trim()}>
          {saving ? <SpinnerIcon className="size-4" /> : null}
          {t("saveChanges")}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>{t("provider")}</Label>
          <Select
            value={provider}
            onValueChange={(value) => setProvider(value as EmailProviderId)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="resend">Resend</SelectItem>
              <SelectItem value="smtp">{t("smtpOption")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-from">{t("fromAddress")}</Label>
          <Input
            id="email-from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            placeholder="Acme <hello@acme.com>"
          />
          <p className="text-xs text-muted-foreground">
            {t("fromHelp")}
          </p>
        </div>

        {provider === "resend" ? (
          <div className="space-y-2">
            <Label htmlFor="email-api-key">{t("resendApiKey")}</Label>
            <SecretInput
              id="email-api-key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                status.hasSecret
                  ? t("storedPlaceholder")
                  : "re_xxxxxxxxxxxxxxxxxxxx"
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("resendHelp")}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="email-smtp-host">{t("smtpHost")}</Label>
                <Input
                  id="email-smtp-host"
                  value={smtpHost}
                  onChange={(event) => setSmtpHost(event.target.value)}
                  placeholder="email-smtp.us-east-1.amazonaws.com"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-smtp-port">{t("port")}</Label>
                <Input
                  id="email-smtp-port"
                  inputMode="numeric"
                  value={smtpPort}
                  onChange={(event) => setSmtpPort(event.target.value)}
                  placeholder="587"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-smtp-user">{t("username")}</Label>
              <Input
                id="email-smtp-user"
                value={smtpUser}
                onChange={(event) => setSmtpUser(event.target.value)}
                placeholder={t("smtpUsernamePlaceholder")}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-smtp-pass">{t("password")}</Label>
              <SecretInput
                id="email-smtp-pass"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  status.hasSecret
                    ? t("storedPlaceholder")
                    : t("smtpPasswordPlaceholder")
                }
              />
            </div>

            <SettingRow
              htmlFor="emailsettingscard-switch-1"
              className="rounded-[var(--radius-inner)] border border-hairline px-4 py-3"
              title={<>{t("useTls")}</>}
              description={<>{t("useTlsDescription")}</>}
              control={<Switch id="emailsettingscard-switch-1" checked={smtpSecure} onCheckedChange={setSmtpSecure} />}
            />
          </>
        )}

        <SettingRow
          htmlFor="emailsettingscard-switch-2"
          className="rounded-[var(--radius-inner)] border border-hairline px-4 py-3"
          title={<>{t("enable")}</>}
          description={<>{t("enableDescription")}</>}
          control={<Switch id="emailsettingscard-switch-2" checked={enabled} onCheckedChange={setEnabled} />}
        />

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
          {provider === "smtp" ? t("testConnection") : t("sendTestEmail")}
        </Button>
      </div>
    </DrawerLayout>
  );
}
