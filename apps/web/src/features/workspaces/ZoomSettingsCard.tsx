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
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
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
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";

export function ZoomSettingsCard({
  config,
  canEdit,
  workspaceId,
}: {
  config: ZoomConfig;
  canEdit: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [disconnecting, startDisconnect] = useTransition();

  const isConnected = config.installationState === "installed";

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

  const badge = isConnected ? (
    <StatusPill tone="on">Connected</StatusPill>
  ) : (
    <StatusPill tone="neutral">Not connected</StatusPill>
  );

  const installUrl = `/api/integrations/zoom/install?ws=${workspaceId}`;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="p-6">
        <SectionHeader
          icon={(props) => <ZoomLogo {...props} />}
          title="Zoom"
          badge={badge}
          description={
            isConnected
              ? "Video interviews automatically create Zoom meetings."
              : "Connect Zoom to automatically create and manage video meetings for scheduled interviews."
          }
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
                <Sheet open={credentialsOpen} onOpenChange={setCredentialsOpen}>
                  <SheetTrigger asChild>
                    <Button disabled={!config.encryptionReady}>
                      <ZoomLogo className="size-4" />
                      Set up Zoom
                    </Button>
                  </SheetTrigger>
                  <ZoomCredentialsForm
                    onSaved={() => {
                      setCredentialsOpen(false);
                      router.refresh();
                    }}
                  />
                </Sheet>
              )
            ) : null
          }
        />

        {!config.encryptionReady && !isConnected ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on
              the server to enable encrypted credential storage.
            </p>
          </div>
        ) : null}
      </div>

      {isConnected ? (
        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <StatCell label="Account">
            <ZoomLogo className="size-4" />
            {config.accountEmail ?? "—"}
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
      ) : null}

      {isConnected && canEdit ? (
        <div className="border-t px-6 py-3">
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
    </Card>
  );
}

/** Form to enter Zoom OAuth app credentials (Client ID + Secret) */
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

  return (
    <DrawerLayout
      title="Set up Zoom"
      description="Create an OAuth app at marketplace.zoom.us, then paste the credentials here. Your Client Secret is encrypted at rest."
      footer={
        <>
          <SheetClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button
            onClick={save}
            disabled={saving || !clientId.trim() || !clientSecret.trim()}
          >
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save credentials
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">How to get credentials:</p>
          <ol className="list-decimal pl-4 space-y-1">
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
              Set the Redirect URL to:{" "}
              <code>
                {typeof window !== "undefined" ? window.location.origin : ""}
                /api/integrations/zoom/callback
              </code>
            </li>
            <li>Add the scope: <code>meeting:write</code></li>
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
            Encrypted at rest — never visible again after saving.
          </p>
        </div>
      </div>
    </DrawerLayout>
  );
}
