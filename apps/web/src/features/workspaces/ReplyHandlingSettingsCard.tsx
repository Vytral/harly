"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
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
  workspaceId,
  canEdit,
}: {
  mailboxStatus: MailboxStatus;
  inboundStatus: WorkspaceInboundEmailStatus;
  workspaceId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
    <StatusPill tone="warn">Choose one mode</StatusPill>
  ) : configured ? (
    <StatusPill tone={enabled ? "on" : "off"}>
      {enabled ? "Connected" : "Disabled"}
    </StatusPill>
  ) : (
    <StatusPill tone="neutral">Not connected</StatusPill>
  );

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="p-6">
        <SectionHeader
          icon={EnvelopeIcon}
          title="Reply handling"
          badge={badge}
          description="Choose how candidate replies return to your team: a shared mailbox or threaded replies via webhook."
          action={
            canEdit ? (
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant={configured ? "outline" : "default"}
                    disabled={!mailboxStatus.encryptionReady}
                  >
                    <KeyDuotoneIcon className="size-4" />
                    {configured ? "Manage" : "Connect"}
                  </Button>
                </SheetTrigger>
                <ReplyHandlingSettingsForm
                  mailboxStatus={mailboxStatus}
                  inboundStatus={inboundStatus}
                  workspaceId={workspaceId}
                  initialMode={mode}
                  onSaved={() => {
                    setOpen(false);
                    router.refresh();
                  }}
                />
              </Sheet>
            ) : null
          }
        />
      </div>

      {!mailboxStatus.encryptionReady ? (
        <div className="mx-6 mb-6 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on
            the server to store reply credentials.
          </p>
        </div>
      ) : null}

      {configured || bothEnabled ? (
        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatCell label="Mode">
            {bothEnabled
              ? "Two modes active"
              : mode === "mailbox"
                ? "Shared mailbox"
                : "Threaded replies"}
          </StatCell>
          <StatCell label={mode === "mailbox" ? "Mailbox" : "Reply domain"}>
            <span className="truncate font-mono text-[13px]">
              {mode === "mailbox"
                ? mailboxStatus.address
                : inboundStatus.replyDomain}
            </span>
          </StatCell>
          <StatCell label="Delivery status">
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
                  Synced {formatRelative(mailboxStatus.lastSyncedAt)}
                </span>
              ) : (
                "Never synced"
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
              "Not configured"
            )}
          </StatCell>
        </div>
      ) : null}

      {mailboxStatus.lastError && mode === "mailbox" ? (
        <div className="mx-6 mb-6 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>Last mailbox sync error: {mailboxStatus.lastError}</p>
        </div>
      ) : null}
    </Card>
  );
}

function ReplyHandlingSettingsForm({
  mailboxStatus,
  inboundStatus,
  workspaceId,
  initialMode,
  onSaved,
}: {
  mailboxStatus: MailboxStatus;
  inboundStatus: WorkspaceInboundEmailStatus;
  workspaceId: string;
  initialMode: ReplyMode;
  onSaved: () => void;
}) {
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const webhookUrl = appUrl
    ? `${appUrl}/api/webhooks/email/${provider}?ws=${workspaceId}`
    : null;

  function save() {
    startSave(async () => {
      if (mode === "mailbox") {
        const result = await saveMailboxSettingsAction({
          ...form,
          enabled: mailboxEnabled,
        });
        if (!result.ok) {
          toast.error(result.error ?? "Could not save reply handling.");
          return;
        }

        // The two transports are alternatives. Keep the workspace in one
        // deterministic reply mode, including for existing workspaces that
        // had both legacy settings enabled.
        const disabled = await disableInboundEmailAction();
        if (!disabled.ok) {
          toast.error(disabled.error ?? "Could not disable threaded replies.");
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
          toast.error(result.error ?? "Could not save reply handling.");
          return;
        }

        const disabled = await disableMailboxSettingsAction();
        if (!disabled.ok) {
          toast.error(
            disabled.error ?? "Could not disable the shared mailbox.",
          );
          return;
        }
      }

      toast.success("Reply handling settings saved");
      onSaved();
    });
  }

  return (
    <DrawerLayout
      title="Configure reply handling"
      description="Choose one reply route. Secrets are encrypted at rest and never shown again."
      footer={
        <>
          <SheetClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button
            onClick={save}
            disabled={saving || !mailboxStatus.encryptionReady}
          >
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Reply route</Label>
          <Select
            value={mode}
            onValueChange={(value) => setMode(value as ReplyMode)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mailbox">Shared mailbox</SelectItem>
              <SelectItem value="threaded">
                Threaded replies via webhook
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Only one route is active at a time. You can change it later without
            losing the saved configuration for the other route.
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
  const [testingConnection, startTest] = useTransition();

  function test() {
    startTest(async () => {
      const result = await testMailboxConnectionAction();
      if (!result.ok) {
        toast.error(result.error ?? "Connection test failed.");
        return;
      }
      toast.success("IMAP connection is healthy");
    });
  }

  const set = onFieldChange;
  const passwordPlaceholder = (hasSecret: boolean) =>
    hasSecret ? "•••••••• (stored — leave blank to keep)" : undefined;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="reply-mailbox-address">Mailbox address</Label>
        <Input
          id="reply-mailbox-address"
          type="email"
          value={form.address}
          onChange={(event) => set("address", event.target.value)}
          placeholder="jobs@yourcompany.com"
        />
        <p className="text-xs text-muted-foreground">
          New messages are imported from this shared mailbox and replies sent
          from the inbox use its SMTP account.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Incoming (IMAP)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Host" htmlFor="reply-imap-host">
            <Input
              id="reply-imap-host"
              value={form.imapHost}
              onChange={(event) => set("imapHost", event.target.value)}
              placeholder="imap.yourcompany.com"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Port" htmlFor="reply-imap-port">
            <Input
              id="reply-imap-port"
              inputMode="numeric"
              value={form.imapPort}
              onChange={(event) => set("imapPort", event.target.value)}
              placeholder="993"
            />
          </Field>
        </div>
        <Field label="Username" htmlFor="reply-imap-user">
          <Input
            id="reply-imap-user"
            value={form.imapUser}
            onChange={(event) => set("imapUser", event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Password" htmlFor="reply-imap-password">
          <Input
            id="reply-imap-password"
            type="password"
            value={form.imapPassword}
            onChange={(event) => set("imapPassword", event.target.value)}
            placeholder={passwordPlaceholder(status.hasImapPassword)}
            autoComplete="off"
          />
        </Field>
        <Field label="Source folder" htmlFor="reply-source-folder">
          <Input
            id="reply-source-folder"
            value={form.sourceFolder}
            onChange={(event) => set("sourceFolder", event.target.value)}
            placeholder="INBOX"
          />
        </Field>
        <TlsToggle
          label="Use TLS"
          checked={form.imapTls}
          onCheckedChange={(value) => set("imapTls", value)}
          ariaLabel="Use IMAP TLS"
        />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Reply transport (SMTP)
        </p>
        <p className="text-xs text-muted-foreground">
          Used only for replies sent from the shared inbox. General candidate
          emails use the Email delivery settings above.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Host" htmlFor="reply-smtp-host">
            <Input
              id="reply-smtp-host"
              value={form.smtpHost}
              onChange={(event) => set("smtpHost", event.target.value)}
              placeholder="smtp.yourcompany.com"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Port" htmlFor="reply-smtp-port">
            <Input
              id="reply-smtp-port"
              inputMode="numeric"
              value={form.smtpPort}
              onChange={(event) => set("smtpPort", event.target.value)}
              placeholder="465"
            />
          </Field>
        </div>
        <Field label="Username" htmlFor="reply-smtp-user">
          <Input
            id="reply-smtp-user"
            value={form.smtpUser}
            onChange={(event) => set("smtpUser", event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Password" htmlFor="reply-smtp-password">
          <Input
            id="reply-smtp-password"
            type="password"
            value={form.smtpPassword}
            onChange={(event) => set("smtpPassword", event.target.value)}
            placeholder={passwordPlaceholder(status.hasSmtpPassword)}
            autoComplete="off"
          />
        </Field>
        <Field label="Sent folder" htmlFor="reply-sent-folder">
          <Input
            id="reply-sent-folder"
            value={form.sentFolder}
            onChange={(event) => set("sentFolder", event.target.value)}
            placeholder="Sent"
          />
        </Field>
        <TlsToggle
          label="Use TLS"
          checked={form.smtpTls}
          onCheckedChange={(value) => set("smtpTls", value)}
          ariaLabel="Use SMTP TLS"
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Enable shared mailbox</p>
          <p className="text-xs text-muted-foreground">
            New mail is polled by the self-hosted cron.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

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
        Test IMAP connection
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
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Provider</Label>
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

      <Field label="Reply domain" htmlFor="reply-domain">
        <Input
          id="reply-domain"
          value={replyDomain}
          onChange={(event) => onReplyDomainChange(event.target.value)}
          placeholder="reply.yourcompany.com"
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Point an MX record here at your provider. Candidate replies use a
          per-application address under this domain.
        </p>
      </Field>

      <Field
        label={
          provider === "postmark"
            ? "Basic auth password"
            : "Webhook signing secret"
        }
        htmlFor="reply-webhook-secret"
      >
        <Input
          id="reply-webhook-secret"
          type="password"
          value={webhookSecret}
          onChange={(event) => onWebhookSecretChange(event.target.value)}
          placeholder={
            status.hasWebhookSecret
              ? "•••••••• (stored — leave blank to keep)"
              : provider === "postmark"
                ? "Set this as the URL's Basic Auth password"
                : "whsec_…"
          }
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          {provider === "postmark"
            ? "Postmark has no webhook signature scheme — secure the URL with Basic Auth."
            : "From Resend → Webhooks, after selecting the email.received event."}
        </p>
      </Field>

      {provider === "resend" ? (
        <Field label="Resend API key" htmlFor="reply-resend-key">
          <Input
            id="reply-resend-key"
            type="password"
            value={resendApiKey}
            onChange={(event) => onResendApiKeyChange(event.target.value)}
            placeholder={
              status.hasResendApiKey
                ? "•••••••• (stored — leave blank to keep)"
                : "re_…"
            }
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Used to fetch the email body after the webhook fires. Needs the
            Emails Receiving scope.
          </p>
        </Field>
      ) : null}

      {webhookUrl ? (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
          <Label>Webhook URL</Label>
          <div className="flex gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                void navigator.clipboard.writeText(webhookUrl);
                toast.success("Webhook URL copied");
              }}
              aria-label="Copy webhook URL"
            >
              <CopyIcon className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Add this URL under your provider&apos;s inbound webhook settings.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Enable threaded replies</p>
          <p className="text-xs text-muted-foreground">
            Replies are routed directly to the candidate timeline.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
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
    <div className="space-y-2">
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
    <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
      <p className="text-sm font-medium">{label}</p>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={ariaLabel}
      />
    </div>
  );
}
