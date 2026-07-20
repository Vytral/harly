"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disconnectDocusignAction,
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
import { WarningCircleIcon, SpinnerIcon, GearSixIcon } from "@/components/ui/icons/phosphor";
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
  tileClassName,
  description,
}: {
  status: WorkspaceDocuSignStatus;
  canEdit: boolean;
  workspaceId: string;
  tileClassName: string;
  description: string;
}) {
  const router = useRouter();
  const connected = status.enabled && status.hasToken;
  const [open, setOpen] = useState(connected || !status.hasCredentials);
  const [testing, startTest] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [savingChannel, startSaveChannel] = useTransition();
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
              <Button variant="outline" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
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
              <Button onClick={() => setOpen((value) => !value)} disabled={!status.encryptionReady}>
                Set up DocuSign
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
          {!status.hasCredentials ? <CredentialsForm onSaved={() => router.refresh()} /> : null}
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
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
                Disconnect DocuSign
              </Button>
            </Card>
          ) : null}
        </InlineReveal>
      ) : null}
    </div>
  );
}

function CredentialsForm({ onSaved }: { onSaved: () => void }) {
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
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-display text-base font-semibold tracking-tight">DocuSign app credentials</h2>
        <p className="text-sm text-muted-foreground">Store the Integration Key and Secret encrypted for this workspace.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="docusign-client-id">Integration Key</Label>
          <Input id="docusign-client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="docusign-client-secret">Secret</Label>
          <Input id="docusign-client-secret" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} autoComplete="new-password" />
        </div>
      </div>
      <Button onClick={save} disabled={saving || !clientId.trim() || !clientSecret.trim()}>
        {saving ? <SpinnerIcon className="size-3.5" /> : null}
        Save credentials
      </Button>
    </Card>
  );
}
