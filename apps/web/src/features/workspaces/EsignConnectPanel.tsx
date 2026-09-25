"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
}: {
  status: WorkspaceEsignStatus;
  canEdit: boolean;
  /** Inbound webhook URL with workspace selector only (`?ws=`), or null. */
  webhookUrl: string | null;
  /** Shared secret sent as X-DocuSeal-Secret, never put in the URL. */
  webhookSecret: string | null;
  tileClassName: string;
  description: string;
}) {
  const router = useRouter();
  const connected = status.enabled && status.hasToken;
  const [open, setOpen] = useState(false);
  const [testing, startTest] = useTransition();

  function testConnection() {
    startTest(async () => {
      const result = await testEsignAction();
      if (result.ok) toast.success("DocuSeal connection is working!");
      else {
        toast.error(result.error ?? "DocuSeal connection test failed.");
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
        statusLabel={connected ? "Connected" : "Not connected"}
        statusTone={connected ? "on" : "neutral"}
        action={
          canEdit ? (
            <Button
              variant={connected ? "outline" : "default"}
              disabled={!status.encryptionReady}
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              {connected ? <GearSixIcon className="size-4" /> : <KeyDuotoneIcon className="size-4" />}
              {connected ? (open ? "Hide settings" : "Manage") : "Connect"}
            </Button>
          ) : null
        }
      />

      {!status.encryptionReady && !connected ? (
        <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on the server to store the DocuSeal API token securely.</p>
        </div>
      ) : null}

      {connected ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <StatCell label="Instance">
              <DocuSealLogo className="size-4" />
              <span className="truncate">{status.url ?? "Connected"}</span>
            </StatCell>
            <StatCell label="Status">
              <button type="button" onClick={testConnection} disabled={testing} className="flex items-center gap-1.5 text-sm font-medium text-pine hover:underline disabled:opacity-50">
                {testing ? <SpinnerIcon className="size-3.5" /> : null}
                {testing ? "Testing…" : "Test connection"}
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
                  <h2 className="font-display text-base font-semibold tracking-tight">Webhook</h2>
                  <p className="text-sm text-muted-foreground">In your DocuSeal instance → Settings → Webhooks, add this endpoint for the <code className="font-mono text-xs">form.completed</code>, <code className="font-mono text-xs">form.declined</code>, and <code className="font-mono text-xs">submission.*</code> events. The URL contains only the workspace selector.</p>
                  <code className="block break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">{webhookUrl}</code>
                  {webhookSecret ? (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-foreground">Authentication header</p>
                      <code className="block break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">X-DocuSeal-Secret: {webhookSecret}</code>
                      <p className="text-xs text-muted-foreground">Configure this as an HTTP header in DocuSeal or in your reverse proxy. Never append the secret as <code className="font-mono text-xs">?secret=</code>.</p>
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
                      toast.error(result.error ?? "Could not disconnect DocuSeal.");
                      return;
                    }
                    toast.success("DocuSeal disconnected");
                    router.refresh();
                  })
                }
                disabled={testing}
              >
                Disconnect DocuSeal
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
        toast.error(result.error ?? "Could not save DocuSeal settings.");
        return;
      }
      toast.success("DocuSeal settings saved");
      onSaved();
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            {status.hasToken ? "Manage connection" : "Connect DocuSeal"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Point Harly at your self-hosted DocuSeal instance. The API token is
            encrypted at rest and never shown again.
          </p>
        </div>
        <a
          href="https://www.docuseal.com/docs/api"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          DocuSeal docs
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="docuseal-url">Instance URL</Label>
          <Input
            id="docuseal-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://sign.yourcompany.com"
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">Base URL of your DocuSeal instance (without /api).</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="docuseal-token">API token</Label>
          <Input
            id="docuseal-token"
            type="password"
            value={apiToken}
            onChange={(event) => setApiToken(event.target.value)}
            placeholder={status.hasToken ? "•••••••• (stored, leave blank to keep)" : "Paste your X-Auth-Token"}
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">DocuSeal → Settings → API. Encrypted at rest.</p>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable DocuSeal</p>
            <p className="text-xs text-muted-foreground">Allow sending documents and offers for signature.</p>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="size-4 accent-pine"
            aria-label="Enable DocuSeal"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={save} disabled={saving || !url.trim() || (!apiToken.trim() && !status.hasToken)}>
          {saving ? <SpinnerIcon className="size-4" /> : null}
          Save
        </Button>
      </div>
    </Card>
  );
}
