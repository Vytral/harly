"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  saveMailboxSettingsAction,
  testMailboxConnectionAction,
} from "@/features/workspaces/mailbox-settings-actions";
import type { MailboxStatus } from "@/lib/mailbox/config";
import {
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import {
  ArrowsClockwiseIcon,
  KeyDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { EnvelopeIcon } from "@/components/ui/icons/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { formatRelative } from "@/lib/date";

export function MailboxSettingsCard({
  status,
  canEdit,
}: {
  status: MailboxStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const isConfigured = status.configured;

  const badge = isConfigured ? (
    status.lastError ? (
      <StatusPill tone="warn">Sync issue</StatusPill>
    ) : (
      <StatusPill tone={status.enabled ? "on" : "off"}>
        {status.enabled ? "Connected" : "Disabled"}
      </StatusPill>
    )
  ) : (
    <StatusPill tone="neutral">Not connected</StatusPill>
  );

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="p-6">
        <SectionHeader
          icon={EnvelopeIcon}
          title="Recruiting inbox"
          badge={badge}
          description="Connect a shared IMAP/SMTP mailbox so candidate replies land straight in the team inbox. Credentials are encrypted at rest."
          action={
            canEdit ? (
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant={isConfigured ? "outline" : "default"}
                    disabled={!status.encryptionReady}
                  >
                    <KeyDuotoneIcon className="size-4" />
                    {isConfigured ? "Manage" : "Connect"}
                  </Button>
                </SheetTrigger>
                <MailboxSettingsForm
                  status={status}
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

      {!status.encryptionReady ? (
        <div className="mx-6 mb-6 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on
            the server to store mailbox credentials.
          </p>
        </div>
      ) : null}

      {isConfigured ? (
        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatCell label="Mailbox address">
            <span className="truncate font-mono text-[13px]">{status.address}</span>
          </StatCell>
          <StatCell label="IMAP host">
            <span className="truncate font-mono text-[13px]">
              {status.imapHost}:{status.imapPort}
            </span>
          </StatCell>
          <StatCell label="Last synced">
            {status.lastSyncedAt ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={
                    status.lastError
                      ? "size-1.5 rounded-full bg-clay"
                      : "size-1.5 rounded-full bg-pine"
                  }
                />
                {formatRelative(status.lastSyncedAt)}
              </span>
            ) : (
              "Never synced"
            )}
          </StatCell>
        </div>
      ) : null}

      {status.lastError ? (
        <div className="mx-6 mb-6 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>Last sync error: {status.lastError}</p>
        </div>
      ) : null}
    </Card>
  );
}

function MailboxSettingsForm({
  status,
  onSaved,
}: {
  status: MailboxStatus;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    address: status.address ?? "",
    imapHost: status.imapHost ?? "",
    imapPort: String(status.imapPort ?? 993),
    imapTls: status.imapTls || !status.configured,
    imapUser: status.imapUser ?? "",
    imapPassword: "",
    sourceFolder: status.sourceFolder ?? "INBOX",
    smtpHost: status.smtpHost ?? "",
    smtpPort: String(status.smtpPort ?? 465),
    smtpTls: status.smtpTls || !status.configured,
    smtpUser: status.smtpUser ?? "",
    smtpPassword: "",
    sentFolder: status.sentFolder ?? "Sent",
  });
  const [enabled, setEnabled] = useState(status.enabled || !status.configured);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  function save() {
    startSave(async () => {
      const result = await saveMailboxSettingsAction({ ...form, enabled });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Recruiting inbox saved");
      onSaved();
    });
  }

  function test() {
    startTest(async () => {
      const result = await testMailboxConnectionAction();
      if (!result.ok) {
        toast.error(result.error ?? "Connection test failed.");
        return;
      }
      toast.success("Mailbox connection is healthy");
    });
  }

  const passwordPlaceholder = (hasSecret: boolean) =>
    hasSecret ? "•••••••• (stored — leave blank to keep)" : undefined;

  return (
    <DrawerLayout
      title="Configure recruiting inbox"
      description="Standard IMAP and SMTP. Secrets are encrypted at rest and never shown again."
      footer={
        <>
          <SheetClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={save} disabled={saving || !status.encryptionReady}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="mailbox-address">Mailbox address</Label>
          <Input
            id="mailbox-address"
            type="email"
            value={form.address}
            onChange={(event) => set("address", event.target.value)}
            placeholder="jobs@yourcompany.com"
          />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Incoming (IMAP)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mailbox-imap-host">Host</Label>
              <Input
                id="mailbox-imap-host"
                value={form.imapHost}
                onChange={(event) => set("imapHost", event.target.value)}
                placeholder="imap.yourcompany.com"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mailbox-imap-port">Port</Label>
              <Input
                id="mailbox-imap-port"
                inputMode="numeric"
                value={form.imapPort}
                onChange={(event) => set("imapPort", event.target.value)}
                placeholder="993"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mailbox-imap-user">Username</Label>
            <Input
              id="mailbox-imap-user"
              value={form.imapUser}
              onChange={(event) => set("imapUser", event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mailbox-imap-password">Password</Label>
            <Input
              id="mailbox-imap-password"
              type="password"
              value={form.imapPassword}
              onChange={(event) => set("imapPassword", event.target.value)}
              placeholder={passwordPlaceholder(status.hasImapPassword)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mailbox-source-folder">Source folder</Label>
            <Input
              id="mailbox-source-folder"
              value={form.sourceFolder}
              onChange={(event) => set("sourceFolder", event.target.value)}
              placeholder="INBOX"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
            <p className="text-sm font-medium">Use TLS</p>
            <Switch
              checked={form.imapTls}
              onCheckedChange={(value) => set("imapTls", value)}
              aria-label="Use IMAP TLS"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Outgoing (SMTP)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mailbox-smtp-host">Host</Label>
              <Input
                id="mailbox-smtp-host"
                value={form.smtpHost}
                onChange={(event) => set("smtpHost", event.target.value)}
                placeholder="smtp.yourcompany.com"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mailbox-smtp-port">Port</Label>
              <Input
                id="mailbox-smtp-port"
                inputMode="numeric"
                value={form.smtpPort}
                onChange={(event) => set("smtpPort", event.target.value)}
                placeholder="465"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mailbox-smtp-user">Username</Label>
            <Input
              id="mailbox-smtp-user"
              value={form.smtpUser}
              onChange={(event) => set("smtpUser", event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mailbox-smtp-password">Password</Label>
            <Input
              id="mailbox-smtp-password"
              type="password"
              value={form.smtpPassword}
              onChange={(event) => set("smtpPassword", event.target.value)}
              placeholder={passwordPlaceholder(status.hasSmtpPassword)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mailbox-sent-folder">Sent folder</Label>
            <Input
              id="mailbox-sent-folder"
              value={form.sentFolder}
              onChange={(event) => set("sentFolder", event.target.value)}
              placeholder="Sent"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
            <p className="text-sm font-medium">Use TLS</p>
            <Switch
              checked={form.smtpTls}
              onCheckedChange={(value) => set("smtpTls", value)}
              aria-label="Use SMTP TLS"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable recruiting inbox</p>
            <p className="text-xs text-muted-foreground">
              New mail is polled by the self-hosted cron.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={test}
          disabled={testing || !status.configured}
        >
          {testing ? (
            <SpinnerIcon className="size-4" />
          ) : (
            <ArrowsClockwiseIcon className="size-4" />
          )}
          Test connection
        </Button>
      </div>
    </DrawerLayout>
  );
}
