"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disconnectDocusignAction,
  saveDocusignConnectSecretAction,
  saveDocusignCredentialsAction,
  saveOfferSignatureChannelAction,
  testDocusignAction,
} from "@/features/workspaces/docusign-settings-actions";
import type { WorkspaceDocuSignStatus } from "@/lib/docusign/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import {
  ArrowUpRightIcon,
  GearSixIcon,
  KeyDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { TheSvgLogo } from "@/components/ui/icons/brands";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function DocuSignLogo({ className }: { className?: string }) {
  return <TheSvgLogo slug="docusign" alt="DocuSign" className={className} />;
}

export function DocuSignConnectPanel({
  status,
  canEdit,
  workspaceId,
  redirectUri,
  tileClassName,
  description,
}: {
  status: WorkspaceDocuSignStatus;
  canEdit: boolean;
  workspaceId: string;
  redirectUri: string;
  tileClassName: string;
  description: string;
}) {
  const router = useRouter();
  const connected = status.enabled && status.hasToken;
  // Form is hidden until the owner clicks Connect/Manage. Landing on the page
  // never shows the form inline. Matches Cal/Slack panels.
  const [open, setOpen] = useState(false);
  const [testing, startTest] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [savingChannel, startSaveChannel] = useTransition();
  const [savingConnectSecret, startSaveConnectSecret] = useTransition();
  const [connectSecret, setConnectSecret] = useState("");
  const installUrl = `/api/integrations/docusign/install?ws=${workspaceId}`;

  function testConnection() {
    startTest(async () => {
      const result = await testDocusignAction();
      if (result.ok) toast.success("DocuSign connection is working!");
      else {
        toast.error(result.error ?? "DocuSign connection test failed.");
        router.refresh();
      }
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectDocusignAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not disconnect DocuSign.");
        return;
      }
      toast.success("DocuSign disconnected");
      router.refresh();
    });
  }

  function setChannel(channel: "email" | "docusign") {
    startSaveChannel(async () => {
      const result = await saveOfferSignatureChannelAction(channel);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update offer signature settings.");
        return;
      }
      toast.success(channel === "docusign" ? "DocuSign enabled for offers" : "Email enabled for offers");
      router.refresh();
    });
  }

  function saveConnectSecret() {
    startSaveConnectSecret(async () => {
      const result = await saveDocusignConnectSecretAction({ connectSecret });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save the Connect HMAC key.");
        return;
      }
      setConnectSecret("");
      toast.success("DocuSign Connect security key saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={DocuSignLogo}
        tileClassName={tileClassName}
        name="DocuSign"
        description={description}
        statusLabel={connected ? "Connected" : "Not connected"}
        statusTone={connected ? "on" : "neutral"}
        action={
          canEdit ? (
            connected ? (
              <Button
                variant="outline"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
              >
                <GearSixIcon className="size-4" />
                {open ? "Hide settings" : "Manage"}
              </Button>
            ) : status.hasCredentials ? (
              <Button asChild>
                <a href={installUrl}>
                  <DocuSignLogo className="size-4" />
                  Connect DocuSign
                </a>
              </Button>
            ) : (
              <Button
                onClick={() => setOpen((value) => !value)}
                disabled={!status.encryptionReady}
                aria-expanded={open}
              >
                <KeyDuotoneIcon className="size-4" />
                Connect
              </Button>
            )
          ) : null
        }
      />

      {!status.encryptionReady && !connected ? (
        <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on the server to store DocuSign credentials securely.</p>
        </div>
      ) : null}

      {connected ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatCell label="Account">
              <DocuSignLogo className="size-4" />
              {status.accountEmail ?? "Connected"}
            </StatCell>
            <StatCell label="Offer signatures">
              {status.offerSignatureChannel === "docusign" ? "DocuSign" : "Email"}
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
              <div>
                <h2 className="font-display text-base font-semibold tracking-tight">Offer signature delivery</h2>
                <p className="text-sm text-muted-foreground">Choose how candidates receive offers by default.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant={status.offerSignatureChannel === "email" ? "default" : "outline"} disabled={savingChannel} onClick={() => setChannel("email")}>Email</Button>
                <Button variant={status.offerSignatureChannel === "docusign" ? "default" : "outline"} disabled={savingChannel} onClick={() => setChannel("docusign")}>DocuSign</Button>
              </div>
              <div className="space-y-3 border-t pt-4">
                <div>
                  <h2 className="font-display text-base font-semibold tracking-tight">DocuSign Connect</h2>
                  <p className="text-sm text-muted-foreground">Store the account-level HMAC key so Harly can verify envelope status callbacks.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="password"
                    value={connectSecret}
                    onChange={(event) => setConnectSecret(event.target.value)}
                    placeholder={status.hasConnectSecret ? "Key saved · enter a replacement" : "Paste the Connect HMAC key"}
                    autoComplete="new-password"
                    className="font-mono text-xs"
                  />
                  <Button onClick={saveConnectSecret} disabled={savingConnectSecret || !connectSecret.trim()}>
                    {savingConnectSecret ? <SpinnerIcon className="size-4" /> : null}
                    Save key
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">In DocuSign Admin → Connect, use the same key. Comma-separated old and new keys are supported during rotation.</p>
              </div>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
                Disconnect DocuSign
              </Button>
            </Card>
          ) : !status.hasCredentials ? (
            <CredentialsForm
              redirectUri={redirectUri}
              onSaved={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          ) : null}
        </InlineReveal>
      ) : null}
    </div>
  );
}

function CredentialsForm({
  onSaved,
  redirectUri,
}: {
  onSaved: () => void;
  redirectUri: string;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      const result = await saveDocusignCredentialsAction({ clientId, clientSecret });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save DocuSign credentials.");
        return;
      }
      toast.success("DocuSign credentials saved. You can now connect.");
      onSaved();
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            Connect DocuSign
          </h2>
          <p className="text-sm text-muted-foreground">
            Create a DocuSign app, then paste the credentials. Your Secret is
            encrypted at rest.
          </p>
        </div>
        <a
          href="https://admindoc.docusign.com/apps-and-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          DocuSign apps
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">How to get credentials:</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Go to{" "}
              <a
                href="https://admindoc.docusign.com/apps-and-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                admindoc.docusign.com/apps-and-keys
              </a>{" "}
              and create a new app
            </li>
            <li>
              Add this exact Redirect URI: <code className="break-all">{redirectUri}</code>
            </li>
            <li>
              Grant the <code>signature</code> and <code>extended</code> scopes
            </li>
            <li>Copy the Integration Key and generate a Secret</li>
          </ol>
          <p className="mt-2 border-t pt-2">
            CORS is not required for Harly: DocuSign calls are made server-side.
            Leave Origin URLs and browser HTTP methods empty.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="docusign-client-id">Integration Key</Label>
          <Input
            id="docusign-client-id"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            placeholder="e.g. 1a2b3c4d-..."
            autoComplete="off"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="docusign-client-secret">Secret</Label>
          <Input
            id="docusign-client-secret"
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder="e.g. abc123def456..."
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Encrypted at rest. Never visible again after saving.
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={save}
          disabled={saving || !clientId.trim() || !clientSecret.trim()}
        >
          {saving ? <SpinnerIcon className="size-4" /> : null}
          Save credentials
        </Button>
      </div>
    </Card>
  );
}
