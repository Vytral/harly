"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  saveZoomCredentialsAction,
  uninstallZoom,
} from "@/features/workspaces/zoom-settings-actions";
import type { ZoomConfig } from "@/lib/zoom/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import { ZoomLogo } from "@/components/ui/icons/brands";
import {
  ArrowUpRightIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ZoomConnectPanel({
  config,
  canEdit,
  workspaceId,
  tileClassName,
  description,
}: {
  config: ZoomConfig;
  canEdit: boolean;
  workspaceId: string;
  tileClassName: string;
  description: string;
}) {
  const router = useRouter();
  const isConnected = config.installationState === "installed";
  // Show the credentials form up-front only when nothing is configured yet.
  const [open, setOpen] = useState(!config.configured && !isConnected);
  const [disconnecting, startDisconnect] = useTransition();

  const statusTone = isConnected ? "on" : "neutral";
  const statusLabel = isConnected ? "Connected" : "Not connected";

  const installUrl = `/api/integrations/zoom/install?ws=${workspaceId}`;

  function disconnect() {
    startDisconnect(async () => {
      const result = await uninstallZoom();
      if (!result.success) {
        toast.error(result.error ?? "Could not disconnect.");
        return;
      }
      toast.success("Zoom disconnected");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={ZoomLogo}
        tileClassName={tileClassName}
        name="Zoom"
        description={description}
        statusLabel={statusLabel}
        statusTone={statusTone}
        action={
          canEdit ? (
            isConnected ? null : config.configured ? (
              <Button asChild>
                <a href={installUrl}>
                  <ZoomLogo className="size-4" />
                  Connect Zoom
                </a>
              </Button>
            ) : (
              <Button
                onClick={() => setOpen((v) => !v)}
                disabled={!config.encryptionReady}
                aria-expanded={open}
              >
                <ZoomLogo className="size-4" />
                Set up Zoom
              </Button>
            )
          ) : null
        }
      />

      {!config.encryptionReady && !isConnected ? (
        <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on
            the server to enable encrypted credential storage.
          </p>
        </div>
      ) : null}

      {isConnected ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <StatCell label="Account">
              <ZoomLogo className="size-4" />
              {config.accountEmail ?? "Not connected"}
            </StatCell>
            <StatCell label="Dashboard">
              <a
                href="https://zoom.us/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-pine transition-colors hover:text-pine-strong"
              >
                Zoom profile
                <ArrowUpRightIcon className="size-3.5" />
              </a>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {isConnected && canEdit ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={disconnect}
            disabled={disconnecting}
          >
            {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
            Disconnect Zoom
          </Button>
        </div>
      ) : null}

      {canEdit && !isConnected && !config.configured ? (
        <InlineReveal open={open}>
          <ZoomCredentialsForm onSaved={() => router.refresh()} />
        </InlineReveal>
      ) : null}
    </div>
  );
}

function ZoomCredentialsForm({ onSaved }: { onSaved: () => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      const result = await saveZoomCredentialsAction({ clientId, clientSecret });
      if (!result.success) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Zoom credentials saved. You can now connect.");
      onSaved();
    });
  }

  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/integrations/zoom/callback`
      : "";

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            Set up Zoom
          </h2>
          <p className="text-sm text-muted-foreground">
            Create an OAuth app on the Zoom Marketplace, then paste the
            credentials. Your Client Secret is encrypted at rest.
          </p>
        </div>
        <a
          href="https://marketplace.zoom.us/user/build"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          Zoom Marketplace
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
                href="https://marketplace.zoom.us/user/build"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                marketplace.zoom.us
              </a>{" "}
              and build a General App (OAuth)
            </li>
            <li>
              Set the Redirect URL to: <code>{redirectUrl}</code>
            </li>
            <li>
              Add the scope: <code>meeting:write</code>
            </li>
            <li>Copy Client ID and Client Secret from the App Credentials tab</li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label htmlFor="zoom-client-id">Client ID</Label>
          <Input
            id="zoom-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="e.g. AbCdEfGhIjKlMnOp"
            autoComplete="off"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="zoom-client-secret">Client Secret</Label>
          <Input
            id="zoom-client-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="e.g. abcdef1234567890abcdef1234567890"
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
