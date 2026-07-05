"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disableInboundEmailAction,
  saveInboundEmailSettingsAction,
} from "@/features/workspaces/email-settings-actions";
import type { WorkspaceInboundEmailStatus } from "@/lib/email/config";
import {
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { PostmarkLogo, ResendLogo } from "@/components/ui/icons/brands";
import {
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

type InboundProviderId = "resend" | "postmark";

const PROVIDER_LABEL: Record<InboundProviderId, string> = {
  resend: "Resend",
  postmark: "Postmark",
};

export function InboundEmailSettingsCard({
  status,
  canEdit,
  workspaceId,
}: {
  status: WorkspaceInboundEmailStatus;
  canEdit: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [togglePending, startToggle] = useTransition();

  const isConfigured = status.hasWebhookSecret && Boolean(status.replyDomain);

  function toggleEnabled(next: boolean) {
    if (!isConfigured && next) {
      toast.error("Configure inbound email first.");
      return;
    }
    startToggle(async () => {
      const result = next
        ? await saveInboundEmailSettingsAction({
            enabled: true,
            provider: status.provider ?? "resend",
            replyDomain: status.replyDomain ?? "",
          })
        : await disableInboundEmailAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(next ? "Inbound email enabled" : "Inbound email disabled");
      router.refresh();
    });
  }

  const badge = isConfigured ? (
    <StatusPill tone={status.enabled ? "on" : "off"}>
      {status.enabled ? "Connected" : "Disabled"}
    </StatusPill>
  ) : (
    <StatusPill tone="neutral">Not connected</StatusPill>
  );

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="p-6">
        <SectionHeader
          icon={EnvelopeIcon}
          title="Inbound email"
          badge={badge}
          description="Receive candidate replies straight onto their timeline. Works with Resend or Postmark — no single provider required."
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
                  <InboundEmailSettingsForm
                    status={status}
                    workspaceId={workspaceId}
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
                      aria-label="Enable inbound email"
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

      {!status.encryptionReady ? (
        <div className="mx-6 mb-6 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on
            the server to store inbound credentials.
          </p>
        </div>
      ) : null}

      {isConfigured ? (
        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatCell label="Provider">
            <span className="inline-flex items-center gap-1.5">
              {status.provider === "postmark" ? (
                <PostmarkLogo className="size-4" />
              ) : (
                <ResendLogo className="size-4" />
              )}
              {status.provider ? PROVIDER_LABEL[status.provider] : "—"}
            </span>
          </StatCell>
          <StatCell label="Reply domain">
            <span className="truncate font-mono text-[13px]">
              {status.replyDomain ?? "Not set"}
            </span>
          </StatCell>
          <StatCell label="Webhook">
            {status.hasWebhookSecret ? "Active" : "Not set"}
          </StatCell>
        </div>
      ) : null}
    </Card>
  );
}

function InboundEmailSettingsForm({
  status,
  workspaceId,
  onSaved,
}: {
  status: WorkspaceInboundEmailStatus;
  workspaceId: string;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState<InboundProviderId>(
    status.provider ?? "resend",
  );
  const [replyDomain, setReplyDomain] = useState(status.replyDomain ?? "");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");
  const [enabled, setEnabled] = useState(status.enabled || !status.hasWebhookSecret);
  const [saving, startSave] = useTransition();

  // Computed from the locally-selected provider (not the saved one) so the
  // URL is visible before the first save — you need it to configure the
  // provider's webhook, and the provider setting is only persisted here.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const webhookUrl = appUrl
    ? `${appUrl}/api/webhooks/email/${provider}?ws=${workspaceId}`
    : null;

  function save() {
    startSave(async () => {
      const result = await saveInboundEmailSettingsAction({
        enabled,
        provider,
        replyDomain,
        webhookSecret: webhookSecret || undefined,
        resendApiKey: provider === "resend" ? resendApiKey || undefined : undefined,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Inbound email settings saved");
      onSaved();
    });
  }

  function copyWebhook() {
    if (!webhookUrl) return;
    void navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  }

  return (
    <DrawerLayout
      title="Configure inbound email"
      description="Secrets are encrypted at rest and never shown again."
      footer={
        <>
          <SheetClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={save} disabled={saving || !replyDomain.trim()}>
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
            onValueChange={(value) => setProvider(value as InboundProviderId)}
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

        <div className="space-y-2">
          <Label htmlFor="inbound-reply-domain">Reply domain</Label>
          <Input
            id="inbound-reply-domain"
            value={replyDomain}
            onChange={(event) => setReplyDomain(event.target.value)}
            placeholder="reply.yourcompany.com"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Point an MX record here at your provider. Candidate replies land
            on a per-application address under this domain.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inbound-webhook-secret">
            {provider === "postmark" ? "Basic auth password" : "Webhook signing secret"}
          </Label>
          <Input
            id="inbound-webhook-secret"
            type="password"
            value={webhookSecret}
            onChange={(event) => setWebhookSecret(event.target.value)}
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
              ? "Postmark has no webhook signature scheme — secure the URL with Basic Auth using this password."
              : "From Resend → Webhooks, after selecting the email.received event."}
          </p>
        </div>

        {provider === "resend" ? (
          <div className="space-y-2">
            <Label htmlFor="inbound-resend-key">Resend API key</Label>
            <Input
              id="inbound-resend-key"
              type="password"
              value={resendApiKey}
              onChange={(event) => setResendApiKey(event.target.value)}
              placeholder={
                status.hasResendApiKey
                  ? "•••••••• (stored — leave blank to keep)"
                  : "re_…"
              }
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Separate from your outbound Resend key — used to fetch the
              email body after the webhook fires. Needs the Emails Receiving
              scope.
            </p>
          </div>
        ) : null}

        {webhookUrl ? (
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={copyWebhook}>
                <CopyIcon className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL under your provider&apos;s inbound webhook
              settings — it updates as you switch provider above, saving
              isn&apos;t required first.
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable inbound email</p>
            <p className="text-xs text-muted-foreground">
              When off, candidate replies aren&apos;t recorded.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
    </DrawerLayout>
  );
}
