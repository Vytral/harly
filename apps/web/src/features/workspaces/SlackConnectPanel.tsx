"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disconnectSlackAction,
  listSlackChannelsAction,
  saveSlackCredentialsAction,
  saveSlackSettingsAction,
  testSlackAction,
  type SlackChannel,
} from "@/features/workspaces/slack-settings-actions";
import type { WorkspaceSlackStatus } from "@/lib/slack/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import { SlackLogo } from "@/components/ui/icons/brands";
import {
  ArrowUpRightIcon,
  GearSixIcon,
  PaperPlaneDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type EventOption = { value: string; label: string };

export function SlackConnectPanel({
  status,
  events,
  canEdit,
  workspaceId,
  tileClassName,
  description,
}: {
  status: WorkspaceSlackStatus;
  events: EventOption[];
  canEdit: boolean;
  workspaceId: string;
  tileClassName: string;
  description: string;
}) {
  const router = useRouter();
  const isConnected = status.hasToken;
  const [open, setOpen] = useState(isConnected || !status.hasCredentials);
  const [togglePending, startToggle] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  const statusTone = isConnected ? (status.enabled ? "on" : "off") : "neutral";
  const statusLabel = isConnected
    ? status.enabled
      ? "Connected"
      : "Disabled"
    : "Not connected";

  const installUrl = `/api/integrations/slack/install?ws=${workspaceId}`;

  function toggleEnabled(next: boolean) {
    if (!isConnected) return;
    if (next && !status.channelId) {
      toast.error("Select a channel first.");
      return;
    }
    startToggle(async () => {
      const result = await saveSlackSettingsAction({
        enabled: next,
        channelId: status.channelId ?? "",
        channelName: status.channelName ?? "",
        events: status.events,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(next ? "Slack notifications on" : "Slack notifications off");
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectSlackAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not disconnect.");
        return;
      }
      toast.success("Slack disconnected");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={SlackLogo}
        tileClassName={tileClassName}
        name="Slack"
        description={description}
        statusLabel={statusLabel}
        statusTone={statusTone}
        action={
          canEdit ? (
            isConnected ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                >
                  <GearSixIcon className="size-4" />
                  {open ? "Hide settings" : "Manage"}
                </Button>
                <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                  <Switch
                    checked={status.enabled}
                    disabled={togglePending}
                    onCheckedChange={toggleEnabled}
                    aria-label="Enable Slack notifications"
                  />
                  <span className="text-muted-foreground">
                    {status.enabled ? "On" : "Off"}
                  </span>
                </label>
              </>
            ) : status.hasCredentials ? (
              <Button asChild>
                <a href={installUrl}>
                  <SlackLogo className="size-4" />
                  Add to Slack
                </a>
              </Button>
            ) : (
              <Button
                onClick={() => setOpen((v) => !v)}
                disabled={!status.encryptionReady}
                aria-expanded={open}
              >
                <SlackLogo className="size-4" />
                Set up Slack
              </Button>
            )
          ) : null
        }
      />

      {!status.encryptionReady && !isConnected ? (
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
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatCell label="Workspace">
              <SlackLogo className="size-4" />
              {status.teamName ?? "Not connected"}
            </StatCell>
            <StatCell label="Channel">
              {status.channelName ? `#${status.channelName}` : "Not selected"}
            </StatCell>
            <StatCell label="Events">
              <span className="text-muted-foreground">
                {status.events.length === 0
                  ? "None selected"
                  : `${status.events.length} subscribed`}
              </span>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {canEdit ? (
        <InlineReveal open={open}>
          {isConnected ? (
            <SlackConfigForm
              status={status}
              events={events}
              onSaved={() => router.refresh()}
              onDisconnect={disconnect}
              disconnecting={disconnecting}
            />
          ) : !status.hasCredentials ? (
            <SlackCredentialsForm onSaved={() => router.refresh()} />
          ) : null}
        </InlineReveal>
      ) : null}
    </div>
  );
}

function SlackCredentialsForm({ onSaved }: { onSaved: () => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      const result = await saveSlackCredentialsAction({ clientId, clientSecret });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Slack credentials saved. You can now connect.");
      onSaved();
    });
  }

  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/integrations/slack/callback`
      : "";

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            Set up Slack integration
          </h2>
          <p className="text-sm text-muted-foreground">
            Create a Slack App, then paste the credentials. Your Client Secret is
            encrypted at rest.
          </p>
        </div>
        <a
          href="https://api.slack.com/apps"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          Slack apps
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
                href="https://api.slack.com/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                api.slack.com/apps
              </a>{" "}
              and create a new app
            </li>
            <li>
              Under OAuth &amp; Permissions, add scopes: <code>chat:write</code>,{" "}
              <code>channels:read</code>, <code>groups:read</code>
            </li>
            <li>
              Set the Redirect URL to: <code>{redirectUrl}</code>
            </li>
            <li>Copy Client ID and Client Secret from Basic Information</li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label htmlFor="slack-client-id">Client ID</Label>
          <Input
            id="slack-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="e.g. 1234567890.1234567890"
            autoComplete="off"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slack-client-secret">Client Secret</Label>
          <Input
            id="slack-client-secret"
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

function SlackConfigForm({
  status,
  events,
  onSaved,
  onDisconnect,
  disconnecting,
}: {
  status: WorkspaceSlackStatus;
  events: EventOption[];
  onSaved: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [loadingChannels, startLoadChannels] = useTransition();
  const [channelId, setChannelId] = useState(status.channelId ?? "");
  const [channelName, setChannelName] = useState(status.channelName ?? "");
  const [selected, setSelected] = useState<string[]>(
    status.events.length > 0 ? status.events : events.map((e) => e.value),
  );
  const [enabled, setEnabled] = useState(status.enabled);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const [loaded, setLoaded] = useState(false);

  function loadChannels() {
    startLoadChannels(async () => {
      const result = await listSlackChannelsAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setChannels(result.channels);
      setLoaded(true);
    });
  }

  function selectChannel(id: string) {
    setChannelId(id);
    const ch = channels.find((c) => c.id === id);
    setChannelName(ch?.name ?? "");
  }

  function toggleEvent(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function runTest() {
    startTest(async () => {
      const result = await testSlackAction();
      if (!result.ok) {
        toast.error(result.error ?? "Test failed.");
        return;
      }
      toast.success("Test message sent to Slack!");
    });
  }

  function save() {
    if (!channelId) {
      toast.error("Select a channel first.");
      return;
    }
    startSave(async () => {
      const result = await saveSlackSettingsAction({
        enabled,
        channelId,
        channelName,
        events: selected,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Slack settings saved");
      onSaved();
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-5 space-y-0.5">
        <h2 className="font-display text-base font-semibold tracking-tight">
          Configure Slack
        </h2>
        <p className="text-sm text-muted-foreground">
          Connected to {status.teamName ?? "Slack"}. Choose a channel and events.
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Channel</Label>
          {!loaded ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={loadChannels}
              disabled={loadingChannels}
            >
              {loadingChannels ? <SpinnerIcon className="size-4" /> : null}
              Load channels from Slack
            </Button>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
              {channels.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  No channels found. Invite the Harly bot to a channel first.
                </p>
              ) : (
                channels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => selectChannel(ch.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                      channelId === ch.id
                        ? "bg-sage font-medium text-sage-ink"
                        : "hover:bg-muted",
                    )}
                  >
                    <span className="text-muted-foreground">#</span>
                    {ch.name}
                  </button>
                ))
              )}
            </div>
          )}
          {channelName && (
            <p className="text-xs text-muted-foreground">
              Selected: <span className="font-medium">#{channelName}</span>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Notify on</Label>
          <div className="flex flex-wrap gap-1.5">
            {events.map((event) => (
              <button
                key={event.value}
                type="button"
                onClick={() => toggleEvent(event.value)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                  selected.includes(event.value)
                    ? "border-pine/40 bg-sage/50 text-sage-ink"
                    : "bg-card text-muted-foreground hover:border-foreground/15 hover:text-foreground",
                )}
              >
                {event.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable</p>
            <p className="text-xs text-muted-foreground">
              When off, no messages are posted.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDisconnect}
          disabled={disconnecting}
        >
          {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
          Disconnect
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={runTest}
            disabled={testing || !status.channelId}
          >
            {testing ? (
              <SpinnerIcon className="size-4" />
            ) : (
              <PaperPlaneDuotoneIcon className="size-4" />
            )}
            Send test
          </Button>
          <Button onClick={save} disabled={saving || !channelId}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save
          </Button>
        </div>
      </div>
    </Card>
  );
}
