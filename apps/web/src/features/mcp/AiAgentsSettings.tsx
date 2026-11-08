"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingRow, SettingRows } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckIcon, CopyIcon, PlugsConnectedIcon, RobotDuotoneIcon } from "@/components/ui/icons/phosphor";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import { revokeMcpConnectionAction, updateMcpSettingsAction } from "@/lib/mcp/settings-actions";
import { toast } from "@/lib/notification-island/toast";
import { copyText } from "@/lib/utils";

type Connection = {
  id: string;
  clientName: string;
  clientHost: string | null;
  userId: string;
  userName: string;
  userEmail: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

type McpSettingsView = {
  enabled: boolean;
  clientMode: "any" | "known_only";
  allowDcr: boolean;
};

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy(key: string, value: string) {
      copyText(value).then(
        () => {
          setCopied(key);
          window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800);
        },
        () => toast.error("Could not copy"),
      );
    },
  };
}

function CopyButton({ label, value, id, copied, onCopy }: { label: string; value: string; id: string; copied: string | null; onCopy: (id: string, value: string) => void }) {
  const done = copied === id;
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => onCopy(id, value)} aria-label={label} className="shrink-0">
      {done ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      <span aria-live="polite">{done ? "Copied" : "Copy"}</span>
    </Button>
  );
}

function Snippet({ id, code, hint, copied, onCopy }: { id: string; code: string; hint?: string; copied: string | null; onCopy: (id: string, value: string) => void }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-inner)] border border-hairline bg-card-inset">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-soft-ink">{hint ?? "Command"}</span>
        <CopyButton label={`Copy ${hint ?? "command"}`} value={code} id={id} copied={copied} onCopy={onCopy} />
      </div>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-[12.5px] leading-relaxed text-near-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] leading-snug text-near-ink marker:text-soft-ink">{children}</ol>;
}

function SetupInstructions({ url, copied, onCopy }: { url: string; copied: string | null; onCopy: (id: string, value: string) => void }) {
  const cursorJson = JSON.stringify({ mcpServers: { harly: { url } } }, null, 2);
  const vscodeJson = JSON.stringify({ servers: { harly: { type: "http", url } } }, null, 2);
  const geminiJson = JSON.stringify({ mcpServers: { harly: { httpUrl: url } } }, null, 2);

  return (
    <Tabs defaultValue="claude" className="gap-4">
      <TabsList variant="line" className="h-auto max-w-full flex-wrap justify-start">
        <TabsTrigger value="claude">Claude</TabsTrigger>
        <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
        <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
        <TabsTrigger value="cursor">Cursor</TabsTrigger>
        <TabsTrigger value="vscode">VS Code</TabsTrigger>
        <TabsTrigger value="other">Gemini, Grok &amp; others</TabsTrigger>
      </TabsList>

      <TabsContent value="claude" className="space-y-3">
        <Steps>
          <li>Open Claude, then <strong>Settings → Connectors → Add custom connector</strong>.</li>
          <li>Name it Harly and paste the server URL above.</li>
          <li>Choose <strong>Connect</strong> and sign in with your Harly account. On Team and Enterprise plans an Owner adds the connector once in Organization settings, then each person connects with their own account.</li>
        </Steps>
      </TabsContent>

      <TabsContent value="chatgpt" className="space-y-3">
        <Steps>
          <li>Open ChatGPT, then <strong>Settings → Connectors</strong>. Turn on developer mode under Advanced if you do not see Create.</li>
          <li>Choose <strong>Create</strong>, paste the server URL above and pick OAuth as the sign-in method.</li>
          <li>Sign in with your Harly account when ChatGPT opens the consent page.</li>
        </Steps>
      </TabsContent>

      <TabsContent value="claude-code" className="space-y-3">
        <Snippet id="claude-code" hint="Terminal" code={`claude mcp add --transport http harly ${url}`} copied={copied} onCopy={onCopy} />
        <p className="text-[13px] text-soft-ink">Then run <code className="rounded bg-card-inset px-1 py-0.5 font-mono text-[12px]">/mcp</code> inside Claude Code and choose Harly to sign in.</p>
      </TabsContent>

      <TabsContent value="cursor" className="space-y-3">
        <p className="text-[13px] text-soft-ink">Add this to <code className="rounded bg-card-inset px-1 py-0.5 font-mono text-[12px]">~/.cursor/mcp.json</code> (or the project&apos;s <code className="rounded bg-card-inset px-1 py-0.5 font-mono text-[12px]">.cursor/mcp.json</code>), then open Cursor Settings → MCP and sign in to Harly.</p>
        <Snippet id="cursor" hint="mcp.json" code={cursorJson} copied={copied} onCopy={onCopy} />
      </TabsContent>

      <TabsContent value="vscode" className="space-y-3">
        <p className="text-[13px] text-soft-ink">Add this to <code className="rounded bg-card-inset px-1 py-0.5 font-mono text-[12px]">.vscode/mcp.json</code> (or run <strong>MCP: Add Server</strong> and choose HTTP), then start the server and sign in.</p>
        <Snippet id="vscode" hint="mcp.json" code={vscodeJson} copied={copied} onCopy={onCopy} />
      </TabsContent>

      <TabsContent value="other" className="space-y-3">
        <p className="text-[13px] text-soft-ink">Any client that supports remote MCP servers (streamable HTTP) with OAuth works: add a custom or remote MCP server, paste the URL above and sign in when prompted. No API key is needed.</p>
        <Snippet id="gemini-cli" hint="Gemini CLI" code={`gemini mcp add --transport http harly ${url}`} copied={copied} onCopy={onCopy} />
        <Snippet id="gemini-json" hint="Gemini CLI settings.json" code={geminiJson} copied={copied} onCopy={onCopy} />
      </TabsContent>
    </Tabs>
  );
}

function scopeSummary(scopes: string[]) {
  const writes = scopes.filter((scope) => /:(write|send)$/.test(scope)).length;
  const reads = scopes.length - writes;
  const parts = [] as string[];
  if (reads) parts.push(`${reads} read`);
  if (writes) parts.push(`${writes} write`);
  return parts.join(" · ") || "No access";
}

function ConnectionRow({ connection, showUser, isYours, busy, onRevoke }: { connection: Connection; showUser: boolean; isYours: boolean; busy: boolean; onRevoke: () => void }) {
  const writes = connection.scopes.some((scope) => /:(write|send)$/.test(scope));
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-near-ink">{connection.clientName}</p>
          <StatusPill tone={writes ? "warn" : "neutral"} dot={false}>
            {writes ? "Can read and change data" : "Read only"}
          </StatusPill>
          {isYours && showUser ? <StatusPill tone="on" dot={false}>You</StatusPill> : null}
        </div>
        <p className="text-[12.5px] text-soft-ink">
          {showUser ? `${connection.userName} (${connection.userEmail}) · ` : ""}
          {scopeSummary(connection.scopes)} · Connected {formatDistanceToNow(new Date(connection.createdAt), { addSuffix: true })} ·{" "}
          {connection.lastUsedAt ? `Last used ${formatDistanceToNow(new Date(connection.lastUsedAt), { addSuffix: true })}` : "Not used yet"}
        </p>
        {connection.clientHost ? <p className="truncate text-[12px] text-quiet-mist">{connection.clientHost}</p> : null}
      </div>
      <Button variant="outline" size="sm" onClick={onRevoke} disabled={busy} className="shrink-0 self-start sm:self-center">
        {busy ? "Revoking…" : "Revoke"}
      </Button>
    </li>
  );
}

export function AiAgentsSettings(props: {
  serverUrl: string;
  workspaceName: string;
  canManage: boolean;
  canUse: boolean;
  settings: McpSettingsView;
  currentUserId: string;
  connections: Connection[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { copied, copy } = useCopy();
  const [pending, startTransition] = useTransition();
  const [settings, setSettings] = useState(props.settings);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function save(patch: Partial<McpSettingsView>, success: string) {
    const previous = settings;
    setSettings({ ...settings, ...patch });
    startTransition(async () => {
      const result = await updateMcpSettingsAction(patch);
      if (!result.ok) {
        setSettings(previous);
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  async function revoke(connection: Connection) {
    const own = connection.userId === props.currentUserId;
    const ok = await confirm({
      tone: "destructive",
      title: own ? `Disconnect ${connection.clientName}?` : `Disconnect ${connection.clientName} for ${connection.userName}?`,
      description: "The app loses access straight away and has to sign in again to reconnect.",
      confirmLabel: "Revoke access",
    });
    if (!ok) return;
    setRevokingId(connection.id);
    startTransition(async () => {
      const result = await revokeMcpConnectionAction(connection.id);
      setRevokingId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not revoke.");
        return;
      }
      toast.success("Access revoked");
      router.refresh();
    });
  }

  const enabled = settings.enabled;

  return (
    <div className="space-y-6">
      <Card className="gap-5 p-6">
        <SectionHeader
          icon={RobotDuotoneIcon}
          title="Connect an AI agent"
          description={`Let Claude, ChatGPT, Cursor and other MCP apps work in ${props.workspaceName} with your own permissions. You sign in with your Harly account; there is no API key to copy.`}
          badge={<StatusPill tone={enabled ? "on" : "off"}>{enabled ? "On" : "Off"}</StatusPill>}
        />

        {!enabled ? (
          <Callout tone="warning" title="AI agent access is turned off">
            {props.canManage
              ? "Nobody can connect or use AI agents until you turn it back on below."
              : "An administrator turned off AI agent access for this workspace."}
          </Callout>
        ) : null}

        {enabled && !settings.allowDcr ? (
          <Callout tone="warning" title="Claude and ChatGPT can't connect yet">
            {props.canManage
              ? "Automatic app registration is off, so claude.ai and ChatGPT cannot register with this workspace. Turn it on under Workspace controls."
              : "Automatic app registration is off, so Claude and ChatGPT cannot connect. Ask a workspace admin to turn it on."}
          </Callout>
        ) : null}

        {props.canUse ? (
          <>
            <div>
              <label htmlFor="mcp-server-url" className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-soft-ink">
                MCP server URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="mcp-server-url"
                  readOnly
                  value={props.serverUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-11 min-w-0 flex-1 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 font-mono text-[13px] text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                />
                <CopyButton label="Copy MCP server URL" value={props.serverUrl} id="url" copied={copied} onCopy={copy} />
              </div>
            </div>
            <SetupInstructions url={props.serverUrl} copied={copied} onCopy={copy} />
            <p className="text-[12.5px] text-soft-ink">
              Agents can only do what your role allows, and every change they make is recorded under your name. Data an agent reads is sent to that AI provider, so check it is approved for candidate data at your company.
            </p>
          </>
        ) : null}
      </Card>

      {props.canUse ? (
        <Card className="gap-4 p-6">
          <SectionHeader
            icon={PlugsConnectedIcon}
            title={props.canManage ? "Connected apps" : "Your connected apps"}
            description={
              props.canManage
                ? "Every active connection in this workspace. Revoking one signs that app out immediately."
                : "Apps you have signed in to Harly. Revoke any you no longer use."
            }
          />
          {props.connections.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-8 text-center">
              <p className="text-sm font-medium text-near-ink">No apps connected yet</p>
              <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-soft-ink">Add the server URL above to an AI app and sign in. It will show up here.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {props.connections.map((connection) => (
                <ConnectionRow
                  key={connection.id}
                  connection={connection}
                  showUser={props.canManage}
                  isYours={connection.userId === props.currentUserId}
                  busy={revokingId === connection.id}
                  onRevoke={() => void revoke(connection)}
                />
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {props.canManage ? (
        <Card className="gap-0 overflow-hidden p-0">
          <div className="px-6 pt-6 pb-2">
            <SectionHeader
              icon={RobotDuotoneIcon}
              title="Workspace controls"
              description="Who can connect AI agents to this workspace."
            />
          </div>
          <SettingRows>
            <SettingRow
              title="Allow AI agents to connect"
              description="When off, no app can sign in and every existing connection stops working at once. Members still need the Connect AI agents permission."
              htmlFor="mcp-enabled"
              control={
                <Switch
                  id="mcp-enabled"
                  checked={enabled}
                  disabled={pending}
                  onCheckedChange={(checked) => save({ enabled: checked }, checked ? "AI agents can connect" : "AI agent access turned off")}
                />
              }
            />
            <SettingRow
              title="Which apps may connect"
              description="Known apps are Claude, ChatGPT, Gemini, Grok, Cursor, VS Code and similar well-known clients. Any app lets members connect other MCP clients after they review its consent screen."
              align="start"
            >
              <SegmentedControl
                aria-label="Which apps may connect"
                value={settings.clientMode}
                options={[
                  { value: "any", label: "Any MCP app", disabled: pending },
                  { value: "known_only", label: "Known apps only", disabled: pending },
                ]}
                onValueChange={(value) => save({ clientMode: value }, value === "any" ? "Any MCP app may connect" : "Only known apps may connect")}
                className="max-w-md"
              />
            </SettingRow>
            <SettingRow
              title="Allow automatic app registration"
              description="Lets apps register themselves when they first connect. Claude (claude.ai) and ChatGPT need this: with it off they cannot connect, even if &ldquo;Any MCP app&rdquo; is selected above. Turn off only to accept apps that publish a client metadata document."
              htmlFor="mcp-dcr"
              control={
                <Switch
                  id="mcp-dcr"
                  checked={settings.allowDcr}
                  disabled={pending}
                  onCheckedChange={(checked) => save({ allowDcr: checked }, checked ? "Automatic registration on" : "Automatic registration off")}
                />
              }
            />
          </SettingRows>
        </Card>
      ) : null}
    </div>
  );
}
