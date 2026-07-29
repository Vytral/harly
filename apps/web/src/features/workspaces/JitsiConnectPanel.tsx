"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import {
  disconnectJitsiAction,
  saveJitsiSettingsAction,
  testJitsiConnectionAction,
} from "@/features/workspaces/jitsi-settings-actions";
import type { WorkspaceJitsiStatus } from "@/lib/jitsi/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import { TheSvgLogo } from "@/components/ui/icons/brands";
import {
  ArrowUpRightIcon,
  CheckCircleIcon,
  GearSixIcon,
  KeyDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function JitsiLogo({ className }: { className?: string }) {
  return <TheSvgLogo slug="jitsi" alt="Jitsi" className={className} />;
}

type TestState =
  | { kind: "idle" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export function JitsiConnectPanel({
  status,
  canEdit,
  tileClassName,
  description,
}: {
  status: WorkspaceJitsiStatus;
  canEdit: boolean;
  tileClassName: string;
  description: string;
}) {
  const router = useRouter();
  const isConfigured = Boolean(status.baseUrl);
  const [open, setOpen] = useState(isConfigured);
  const [togglePending, startToggle] = useTransition();

  const statusTone = isConfigured
    ? status.enabled
      ? "on"
      : "off"
    : "neutral";
  const statusLabel = isConfigured
    ? status.enabled
      ? "Connected"
      : "Disabled"
    : "Not connected";

  function toggleEnabled(next: boolean) {
    if (!status.baseUrl) {
      toast.error("Add an instance URL first.");
      return;
    }
    startToggle(async () => {
      const result = await saveJitsiSettingsAction({
        enabled: next,
        baseUrl: status.baseUrl!,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(next ? "Jitsi enabled" : "Jitsi disabled");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={JitsiLogo}
        logoClassName="size-9"
        tileClassName={tileClassName}
        name="Jitsi Meet"
        description={description}
        statusLabel={statusLabel}
        statusTone={statusTone}
        action={
          canEdit ? (
            <>
              <Button
                variant={isConfigured ? "outline" : "default"}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                {isConfigured ? (
                  <GearSixIcon className="size-4" />
                ) : (
                  <KeyDuotoneIcon className="size-4" />
                )}
                {isConfigured ? (open ? "Hide settings" : "Manage") : "Connect"}
              </Button>
              {isConfigured ? (
                <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                  <Switch
                    checked={status.enabled}
                    disabled={togglePending}
                    onCheckedChange={toggleEnabled}
                    aria-label="Enable Jitsi"
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

      {isConfigured ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <StatCell label="Instance">
              <JitsiLogo className="size-4" />
              <span className="truncate">{status.baseUrl}</span>
            </StatCell>
            <StatCell label="Rooms">
              <span className="text-muted-foreground">
                Generated per interview (random code)
              </span>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {canEdit ? (
        <InlineReveal open={open}>
          <JitsiConnectForm
            status={status}
            onSaved={() => router.refresh()}
          />
        </InlineReveal>
      ) : null}
    </div>
  );
}

function JitsiConnectForm({
  status,
  onSaved,
}: {
  status: WorkspaceJitsiStatus;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(status.baseUrl ?? "");
  const [enabled, setEnabled] = useState(status.enabled || !status.baseUrl);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const isPublicInstance = baseUrl.trim().replace(/\/+$/, "") === "https://meet.jit.si";

  function testConnection() {
    startTest(async () => {
      setTest({ kind: "idle" });
      const result = await testJitsiConnectionAction({
        baseUrl: baseUrl || undefined,
      });
      if (result.ok) {
        setTest({ kind: "ok" });
        toast.success("Instance is reachable");
      } else {
        setTest({
          kind: "error",
          message: result.error ?? "Could not reach that instance.",
        });
      }
    });
  }

  function save() {
    startSave(async () => {
      const result = await saveJitsiSettingsAction({ enabled, baseUrl });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Jitsi settings saved");
      onSaved();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectJitsiAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not disconnect.");
        return;
      }
      toast.success("Jitsi disconnected");
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            {status.baseUrl ? "Manage connection" : "Connect Jitsi Meet"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Video interviews get a unique room link on your instance. No account
            or API key needed.
          </p>
        </div>
        <a
          href="https://jitsi.github.io/handbook/docs/devops-guide/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          Self-host guide
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="jitsi-base">Instance base URL</Label>
          <Input
            id="jitsi-base"
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setTest({ kind: "idle" });
            }}
            placeholder="https://meet.jit.si"
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Your self-hosted instance, or the public https://meet.jit.si.
          </p>
        </div>

        {isPublicInstance ? (
          <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              Rooms on the public meet.jit.si are open to anyone with the link.
              Room codes are random and unguessable, but for sensitive
              interviews prefer a self-hosted instance with a lobby.
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable Jitsi</p>
            <p className="text-xs text-muted-foreground">
              Used for video interviews when Zoom, Teams and Google Meet are not
              connected.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {test.kind === "error" ? (
          <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
            <p>{test.message}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
        {status.baseUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={disconnect}
            disabled={disconnecting}
          >
            {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
            Disconnect
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={testConnection}
            disabled={testing || !baseUrl.trim()}
          >
            {testing ? (
              <SpinnerIcon className="size-4" />
            ) : test.kind === "ok" ? (
              <CheckCircleIcon className="size-4 text-pine" />
            ) : null}
            {test.kind === "ok" ? "Instance OK" : "Test connection"}
          </Button>
          <Button onClick={save} disabled={saving || !baseUrl.trim()}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save
          </Button>
        </div>
      </div>
    </Card>
  );
}
