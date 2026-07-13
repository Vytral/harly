"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [togglePending, startToggle] = useTransition();

  const isConfigured = Boolean(status.from);

  function toggleEnabled(next: boolean) {
    if (!isConfigured && next) {
      toast.error("Configure email settings first.");
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
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(next ? "Email enabled" : "Email disabled");
      router.refresh();
    });
  }

  const badge = isConfigured ? (
    <StatusPill tone={status.enabled ? "on" : "off"}>
      {status.enabled ? "Connected" : "Disabled"}
    </StatusPill>
  ) : status.usingPlatformDefault ? (
    <StatusPill tone="neutral">Harly default</StatusPill>
  ) : (
    <StatusPill tone="neutral">Not connected</StatusPill>
  );

  return (
    <div className="space-y-5">
      {!status.encryptionReady ? <EncryptionWarning /> : null}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="p-6">
          <SectionHeader
            icon={EnvelopeIcon}
            title="Email delivery"
            badge={badge}
            description="Send candidate and recruiter emails from your own domain via Resend or SMTP. Without it, Harly sends from a shared address."
            action={
              canEdit ? (
                <>
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
                    <EmailSettingsForm
                      status={status}
                      onSaved={() => {
                        setOpen(false);
                        router.refresh();
                      }}
                    />
                  </Sheet>
                  {isConfigured ? (
                    <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                      <Switch
                        checked={status.enabled}
                        disabled={togglePending}
                        onCheckedChange={toggleEnabled}
                        aria-label="Enable email"
                      />
                      <span className="text-muted-foreground">
                        {status.enabled ? "On" : "Off"}
                      </span>
                    </label>
                  ) : null}
                </>
              ) : null
            }
          />
        </div>

        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <StatCell label="Provider">
            {status.provider === "resend" ? (
              <ResendLogo className="size-3.5" />
            ) : (
              <EnvelopeIcon className="size-4 text-muted-foreground" />
            )}
            {PROVIDER_LABEL[status.provider!]}
          </StatCell>
          <StatCell label="From address">
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
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
      <p>
        Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on the
        server to store email credentials.
      </p>
    </div>
  );
}

function EmailSettingsForm({
  status,
  onSaved,
}: {
  status: WorkspaceEmailStatus;
  onSaved: () => void;
}) {
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
        toast.error(result.error ?? "Test failed.");
        return;
      }
      toast.success(
        provider === "smtp"
          ? "SMTP connection verified"
          : "Test email sent — check your inbox",
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
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Email settings saved");
      onSaved();
    });
  }

  const canTest =
    from.trim().length > 0 &&
    (provider === "resend"
      ? Boolean(apiKey || status.hasSecret)
      : smtpHost.trim().length > 0 && smtpPort.trim().length > 0);

  return (
    <DrawerLayout
      title="Configure email"
      description="Secrets are encrypted at rest and never shown again."
      footer={
        <>
          <SheetClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={save} disabled={saving || !from.trim()}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select
            value={provider}
            onValueChange={(value) => setProvider(value as EmailProviderId)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="resend">Resend</SelectItem>
              <SelectItem value="smtp">SMTP (custom, AWS SES, etc.)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-from">From address</Label>
          <Input
            id="email-from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            placeholder="Acme <hello@acme.com>"
          />
          <p className="text-xs text-muted-foreground">
            Must be a verified sender or domain with your provider.
          </p>
        </div>

        {provider === "resend" ? (
          <div className="space-y-2">
            <Label htmlFor="email-api-key">Resend API key</Label>
            <Input
              id="email-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                status.hasSecret
                  ? "•••••••• (stored — leave blank to keep)"
                  : "re_xxxxxxxxxxxxxxxxxxxx"
              }
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Resend → API Keys. Needs permission to send from your domain.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="email-smtp-host">SMTP host</Label>
                <Input
                  id="email-smtp-host"
                  value={smtpHost}
                  onChange={(event) => setSmtpHost(event.target.value)}
                  placeholder="email-smtp.us-east-1.amazonaws.com"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-smtp-port">Port</Label>
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
              <Label htmlFor="email-smtp-user">Username</Label>
              <Input
                id="email-smtp-user"
                value={smtpUser}
                onChange={(event) => setSmtpUser(event.target.value)}
                placeholder="SMTP username"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-smtp-pass">Password</Label>
              <Input
                id="email-smtp-pass"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  status.hasSecret
                    ? "•••••••• (stored — leave blank to keep)"
                    : "SMTP password"
                }
                autoComplete="off"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Use TLS</p>
                <p className="text-xs text-muted-foreground">
                  Enable for port 465. Leave off for 587/25 (STARTTLS).
                </p>
              </div>
              <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} />
            </div>
          </>
        )}

        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable</p>
            <p className="text-xs text-muted-foreground">
              When off, Harly sends from its shared address instead.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

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
          {provider === "smtp" ? "Test connection" : "Send test email"}
        </Button>
      </div>
    </DrawerLayout>
  );
}
