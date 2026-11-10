"use client";

import { useState, useTransition } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";
import { copyText } from "@/lib/utils";

import {
  disableInboundEmailAction,
  saveInboundEmailSettingsAction,
} from "@/features/workspaces/email-settings-actions";
import {
  disableMailboxSettingsAction,
  saveMailboxSettingsAction,
  testMailboxConnectionAction,
} from "@/features/workspaces/mailbox-settings-actions";
import type { WorkspaceInboundEmailStatus } from "@/lib/email/config";
import type { MailboxStatus } from "@/lib/mailbox/config";
import {
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { PostmarkLogo, ResendLogo } from "@/components/ui/icons/brands";
import {
  ArrowsClockwiseIcon,
  CopyIcon,
  KeyDuotoneIcon,
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
import { formatRelative } from "@/lib/date";

type ReplyMode = "mailbox" | "threaded";
type InboundProviderId = "resend" | "postmark";

const INBOUND_PROVIDER_LABEL: Record<InboundProviderId, string> = {
  resend: "Resend",
  postmark: "Postmark",
};

export function ReplyHandlingSettingsCard({
  mailboxStatus,
  inboundStatus,
  canEdit,
}: {
  mailboxStatus: MailboxStatus;
  inboundStatus: WorkspaceInboundEmailStatus;
  canEdit: boolean;
}) {
  const t = useTranslations("features.workspaces.replyHandlingSettingsCard");
  const locale = useLocale();
  const mailboxConfigured = mailboxStatus.configured;
  const inboundConfigured =
    inboundStatus.hasWebhookSecret && Boolean(inboundStatus.replyDomain);
  const bothEnabled = mailboxStatus.enabled && inboundStatus.enabled;
  const mode: ReplyMode = mailboxStatus.enabled
    ? "mailbox"
    : inboundStatus.enabled
      ? "threaded"
      : mailboxConfigured
        ? "mailbox"
        : "mailbox";
  const configured = mode === "mailbox" ? mailboxConfigured : inboundConfigured;
  const enabled =
    mode === "mailbox" ? mailboxStatus.enabled : inboundStatus.enabled;

  const badge = bothEnabled ? (
    <StatusPill tone="warn">{t("chooseOneMode")}</StatusPill>
  ) : configured ? (
    <StatusPill tone={enabled ? "on" : "off"}>
      {enabled ? t("statusConnected") : t("statusDisabled")}
    </StatusPill>
  ) : (
    <StatusPill tone="neutral">{t("statusNotConnected")}</StatusPill>
  );

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="p-6">
        <SectionHeader
          icon={EnvelopeIcon}
          title={t("title")}
          badge={badge}
          description={t("description")}
          action={
            canEdit ? (
              mailboxStatus.encryptionReady ? (
                <Button asChild variant={configured ? "outline" : "default"}>
                  <Link href={"/settings/email/replies" as Route}>
                    <KeyDuotoneIcon className="size-4" />
                    {configured ? t("manage") : t("connect")}
                  </Link>
                </Button>
              ) : (
                <Button variant="default" disabled>
                  <KeyDuotoneIcon className="size-4" />
                  {t("connect")}
                </Button>
              )
            ) : null
          }
        />
      </div>

      {!mailboxStatus.encryptionReady ? (
        <div className="mx-6 mb-6 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            {t.rich("encryptionKeyNotice", {
              code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
            })}
          </p>
        </div>
      ) : null}

      {configured || bothEnabled ? (
        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatCell label={t("mode")}>
            {bothEnabled
              ? t("modeBothActive")
              : mode === "mailbox"
                ? t("modeSharedMailbox")
                : t("modeThreaded")}
          </StatCell>
          <StatCell label={mode === "mailbox" ? t("mailbox") : t("replyDomain")}>
            <span className="truncate font-mono text-[13px]">
              {mode === "mailbox"
                ? mailboxStatus.address
                : inboundStatus.replyDomain}
            </span>
          </StatCell>
          <StatCell label={t("deliveryStatus")}>
            {mode === "mailbox" ? (
              mailboxStatus.lastSyncedAt ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={
                      mailboxStatus.lastError
                        ? "size-1.5 rounded-full bg-clay"
                        : "size-1.5 rounded-full bg-pine"
                    }
                  />
                  {t("syncedAt", {
                    time: formatRelative(mailboxStatus.lastSyncedAt, locale),
                  })}
                </span>
              ) : (
                t("neverSynced")
              )
            ) : inboundStatus.provider ? (
              <span className="inline-flex items-center gap-1.5">
                {inboundStatus.provider === "postmark" ? (
                  <PostmarkLogo className="size-4" />
                ) : (
                  <ResendLogo className="size-4" />
                )}
                {INBOUND_PROVIDER_LABEL[inboundStatus.provider]}
              </span>
            ) : (
              t("notConfigured")
            )}
          </StatCell>
        </div>
      ) : null}

      {mailboxStatus.lastError && mode === "mailbox" ? (
        <div className="mx-6 mb-6 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>{t("lastSyncError", { error: mailboxStatus.lastError })}</p>
        </div>
      ) : null}
    </Card>
  );
}

export function ReplyHandlingSettingsForm({
  mailboxStatus,
  inboundStatus,
  workspaceId,
  initialMode,
  appUrl,
}: {
  mailboxStatus: MailboxStatus;
  inboundStatus: WorkspaceInboundEmailStatus;
  workspaceId: string;
  initialMode: ReplyMode;
  appUrl: string;
}) {
  const t = useTranslations("features.workspaces.replyHandlingSettingsCard");
  const router = useRouter();
  const [mode, setMode] = useState<ReplyMode>(initialMode);
  const [saving, startSave] = useTransition();

  const mailboxForm = useState({
    address: mailboxStatus.address ?? "",
    imapHost: mailboxStatus.imapHost ?? "",
    imapPort: String(mailboxStatus.imapPort ?? 993),
    imapTls: mailboxStatus.imapTls || !mailboxStatus.configured,
    imapUser: mailboxStatus.imapUser ?? "",
    imapPassword: "",
    sourceFolder: mailboxStatus.sourceFolder ?? "INBOX",
    smtpHost: mailboxStatus.smtpHost ?? "",
    smtpPort: String(mailboxStatus.smtpPort ?? 465),
    smtpTls: mailboxStatus.smtpTls || !mailboxStatus.configured,
    smtpUser: mailboxStatus.smtpUser ?? "",
    smtpPassword: "",
    sentFolder: mailboxStatus.sentFolder ?? "Sent",
  });
  const [mailboxEnabled, setMailboxEnabled] = useState(
    mailboxStatus.enabled || !mailboxStatus.configured,
  );
  const [provider, setProvider] = useState<InboundProviderId>(
    inboundStatus.provider ?? "resend",
  );
  const [replyDomain, setReplyDomain] = useState(
    inboundStatus.replyDomain ?? "",
  );
  const [webhookSecret, setWebhookSecret] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");
  const [inboundEnabled, setInboundEnabled] = useState(
    inboundStatus.enabled || !inboundStatus.hasWebhookSecret,
  );

  const [form, setForm] = mailboxForm;
  const setMailboxField = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  const webhookUrl = `${appUrl}/api/webhooks/email/${provider}?ws=${workspaceId}`;

  function save() {
    startSave(async () => {
      if (mode === "mailbox") {
        const result = await saveMailboxSettingsAction({
          ...form,
          enabled: mailboxEnabled,
        });
        if (!result.ok) {
          toast.error(result.error ?? t("saveError"));
          return;
        }

        // The two transports are alternatives. Keep the workspace in one
        // deterministic reply mode, including for existing workspaces that
        // had both legacy settings enabled.
        const disabled = await disableInboundEmailAction();
        if (!disabled.ok) {
          toast.error(disabled.error ?? t("disableThreadedError"));
          return;
        }
      } else {
        const result = await saveInboundEmailSettingsAction({
          enabled: inboundEnabled,
          provider,
          replyDomain,
          webhookSecret: webhookSecret || undefined,
          resendApiKey:
            provider === "resend" ? resendApiKey || undefined : undefined,
        });
        if (!result.ok) {
          toast.error(result.error ?? t("saveError"));
          return;
        }

        const disabled = await disableMailboxSettingsAction();
        if (!disabled.ok) {
          toast.error(disabled.error ?? t("disableMailboxError"));
          return;
        }
      }

      toast.success(t("saved"));
      router.refresh();
    });
  }

  return (
    <DrawerLayout
      title={t("formTitle")}
      description={t("formDescription")}
      surface="page"
      footer={
        <Button
          onClick={save}
          disabled={saving || !mailboxStatus.encryptionReady}
        >
          {saving ? <SpinnerIcon className="size-4" /> : null}
          {t("saveChanges")}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>{t("routeLabel")}</Label>
          <Select
            value={mode}
            onValueChange={(value) => setMode(value as ReplyMode)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mailbox">{t("routeSharedMailbox")}</SelectItem>
              <SelectItem value="threaded">
                {t("routeThreaded")}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("routeHelp")}
          </p>
        </div>

        {mode === "mailbox" ? (
          <SharedMailboxFields
            form={form}
            status={mailboxStatus}
            enabled={mailboxEnabled}
            onFieldChange={setMailboxField}
            onEnabledChange={setMailboxEnabled}
          />
        ) : (
          <ThreadedReplyFields
            status={inboundStatus}
            provider={provider}
            replyDomain={replyDomain}
            webhookSecret={webhookSecret}
            resendApiKey={resendApiKey}
            enabled={inboundEnabled}
            webhookUrl={webhookUrl}
            onProviderChange={setProvider}
            onReplyDomainChange={setReplyDomain}
            onWebhookSecretChange={setWebhookSecret}
            onResendApiKeyChange={setResendApiKey}
            onEnabledChange={setInboundEnabled}
          />
        )}
      </div>
    </DrawerLayout>
  );
}

function SharedMailboxFields({
  form,
  status,
  enabled,
  onFieldChange,
  onEnabledChange,
}: {
  form: {
    address: string;
    imapHost: string;
    imapPort: string;
    imapTls: boolean;
    imapUser: string;
    imapPassword: string;
    sourceFolder: string;
    smtpHost: string;
    smtpPort: string;
    smtpTls: boolean;
    smtpUser: string;
    smtpPassword: string;
    sentFolder: string;
  };
  status: MailboxStatus;
  enabled: boolean;
  onFieldChange: (key: keyof typeof form, value: string | boolean) => void;
  onEnabledChange: (value: boolean) => void;
}) {
  const t = useTranslations("features.workspaces.replyHandlingSettingsCard");
  const [testingConnection, startTest] = useTransition();

  function test() {
    startTest(async () => {
      const result = await testMailboxConnectionAction();
      if (!result.ok) {
        toast.error(result.error ?? t("testConnectionFailed"));
        return;
      }
      toast.success(t("imapHealthy"));
    });
  }

  const set = onFieldChange;
  const passwordPlaceholder = (hasSecret: boolean) =>
    hasSecret ? t("storedSecretPlaceholder") : undefined;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="reply-mailbox-address">{t("mailboxAddress")}</Label>
        <Input
          id="reply-mailbox-address"
          type="email"
          value={form.address}
          onChange={(event) => set("address", event.target.value)}
          placeholder="jobs@yourcompany.com"
        />
        <p className="text-xs text-muted-foreground">
          {t("mailboxAddressHelp")}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("incomingImap")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("host")} htmlFor="reply-imap-host">
            <Input
              id="reply-imap-host"
              value={form.imapHost}
              onChange={(event) => set("imapHost", event.target.value)}
              placeholder="imap.yourcompany.com"
              className="font-mono text-xs"
            />
          </Field>
          <Field label={t("port")} htmlFor="reply-imap-port">
            <Input
              id="reply-imap-port"
              inputMode="numeric"
              value={form.imapPort}
              onChange={(event) => set("imapPort", event.target.value)}
              placeholder="993"
            />
          </Field>
        </div>
        <Field label={t("username")} htmlFor="reply-imap-user">
          <Input
            id="reply-imap-user"
            value={form.imapUser}
            onChange={(event) => set("imapUser", event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label={t("password")} htmlFor="reply-imap-password">
          <SecretInput
            id="reply-imap-password"
            value={form.imapPassword}
            onChange={(event) => set("imapPassword", event.target.value)}
            placeholder={passwordPlaceholder(status.hasImapPassword)}
          />
        </Field>
        <Field label={t("sourceFolder")} htmlFor="reply-source-folder">
          <Input
            id="reply-source-folder"
            value={form.sourceFolder}
            onChange={(event) => set("sourceFolder", event.target.value)}
            placeholder="INBOX"
          />
        </Field>
        <TlsToggle
          label={t("useTls")}
          checked={form.imapTls}
          onCheckedChange={(value) => set("imapTls", value)}
          ariaLabel={t("useImapTls")}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("outgoingSmtp")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("smtpHelp")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("host")} htmlFor="reply-smtp-host">
            <Input
              id="reply-smtp-host"
              value={form.smtpHost}
              onChange={(event) => set("smtpHost", event.target.value)}
              placeholder="smtp.yourcompany.com"
              className="font-mono text-xs"
            />
          </Field>
          <Field label={t("port")} htmlFor="reply-smtp-port">
            <Input
              id="reply-smtp-port"
              inputMode="numeric"
              value={form.smtpPort}
              onChange={(event) => set("smtpPort", event.target.value)}
              placeholder="465"
            />
          </Field>
        </div>
        <Field label={t("username")} htmlFor="reply-smtp-user">
          <Input
            id="reply-smtp-user"
            value={form.smtpUser}
            onChange={(event) => set("smtpUser", event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label={t("password")} htmlFor="reply-smtp-password">
          <SecretInput
            id="reply-smtp-password"
            value={form.smtpPassword}
            onChange={(event) => set("smtpPassword", event.target.value)}
            placeholder={passwordPlaceholder(status.hasSmtpPassword)}
          />
        </Field>
        <Field label={t("sentFolder")} htmlFor="reply-sent-folder">
          <Input
            id="reply-sent-folder"
            value={form.sentFolder}
            onChange={(event) => set("sentFolder", event.target.value)}
            placeholder="Sent"
          />
        </Field>
        <TlsToggle
          label={t("useTls")}
          checked={form.smtpTls}
          onCheckedChange={(value) => set("smtpTls", value)}
          ariaLabel={t("useSmtpTls")}
        />
      </div>

      <SettingRow
        htmlFor="replyhandlingsettingscard-switch-1"
        className="rounded-[var(--radius-inner)] border border-hairline px-4 py-3"
        title={t("enableSharedMailbox")}
        description={t("enableSharedMailboxDescription")}
        control={<Switch id="replyhandlingsettingscard-switch-1" checked={enabled} onCheckedChange={onEnabledChange} />}
      />

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={test}
        disabled={testingConnection || !status.configured}
      >
        {testingConnection ? (
          <SpinnerIcon className="size-4" />
        ) : (
          <ArrowsClockwiseIcon className="size-4" />
        )}
        {t("testImap")}
      </Button>
    </div>
  );
}

function ThreadedReplyFields({
  status,
  provider,
  replyDomain,
  webhookSecret,
  resendApiKey,
  enabled,
  webhookUrl,
  onProviderChange,
  onReplyDomainChange,
  onWebhookSecretChange,
  onResendApiKeyChange,
  onEnabledChange,
}: {
  status: WorkspaceInboundEmailStatus;
  provider: InboundProviderId;
  replyDomain: string;
  webhookSecret: string;
  resendApiKey: string;
  enabled: boolean;
  webhookUrl: string | null;
  onProviderChange: (value: InboundProviderId) => void;
  onReplyDomainChange: (value: string) => void;
  onWebhookSecretChange: (value: string) => void;
  onResendApiKeyChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
}) {
  const t = useTranslations("features.workspaces.replyHandlingSettingsCard");
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>{t("provider")}</Label>
        <Select
          value={provider}
          onValueChange={(value) =>
            onProviderChange(value as InboundProviderId)
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="resend">
              <span className="inline-flex items-center gap-2">
                <ResendLogo className="size-4" />
                Resend
              </span>
            </SelectItem>
            <SelectItem value="postmark">
              <span className="inline-flex items-center gap-2">
                <PostmarkLogo className="size-4" />
                Postmark
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Field label={t("replyDomain")} htmlFor="reply-domain">
        <Input
          id="reply-domain"
          value={replyDomain}
          onChange={(event) => onReplyDomainChange(event.target.value)}
          placeholder="reply.yourcompany.com"
          className="font-mono text-xs"
        />
          <p className="text-xs text-muted-foreground">
          {t("replyDomainHelp")}
        </p>
      </Field>

      <Field
        label={
          provider === "postmark"
            ? t("basicAuthPassword")
            : t("webhookSigningSecret")
        }
        htmlFor="reply-webhook-secret"
      >
        <SecretInput
          id="reply-webhook-secret"
          value={webhookSecret}
          onChange={(event) => onWebhookSecretChange(event.target.value)}
          placeholder={
            status.hasWebhookSecret
              ? t("storedSecretPlaceholder")
              : provider === "postmark"
                ? t("basicAuthPlaceholder")
                : "whsec_…"
          }
        />
        <p className="text-xs text-muted-foreground">
          {provider === "postmark"
            ? t("postmarkSecretHelp")
            : t("resendSecretHelp")}
        </p>
      </Field>

      {provider === "resend" ? (
        <Field label={t("resendApiKey")} htmlFor="reply-resend-key">
          <SecretInput
            id="reply-resend-key"
            value={resendApiKey}
            onChange={(event) => onResendApiKeyChange(event.target.value)}
            placeholder={
              status.hasResendApiKey
                ? t("storedSecretPlaceholder")
                : "re_…"
            }
          />
          <p className="text-xs text-muted-foreground">
            {t("resendApiKeyHelp")}
          </p>
        </Field>
      ) : null}

      {webhookUrl ? (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
          <Label>{t("webhookUrl")}</Label>
          <div className="flex gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                void copyText(webhookUrl);
                toast.success(t("webhookUrlCopied"));
              }}
              aria-label={t("copyWebhookUrl")}
            >
              <CopyIcon className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("webhookUrlHelp")}
          </p>
        </div>
      ) : null}

      <SettingRow
        htmlFor="replyhandlingsettingscard-switch-2"
        className="rounded-[var(--radius-inner)] border border-hairline px-4 py-3"
        title={t("autoReceive")}
        description={t("autoReceiveDescription")}
        control={<Switch id="replyhandlingsettingscard-switch-2" checked={enabled} onCheckedChange={onEnabledChange} />}
      />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function TlsToggle({
  label,
  checked,
  onCheckedChange,
  ariaLabel,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <SettingRow
      className="rounded-[var(--radius-inner)] border border-hairline px-4 py-3"
      title={label}
      control={
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-label={ariaLabel}
        />
      }
    />
  );
}
