"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { dateFnsLocale } from "@/lib/date-fns-locale";

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

const NS = "features.mcp.aiAgentsSettings";

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
  const t = useTranslations(NS);
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy(key: string, value: string) {
      copyText(value).then(
        () => {
          setCopied(key);
          window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800);
        },
        () => toast.error(t("copyFailed")),
      );
    },
  };
}

function CopyButton({ label, value, id, copied, onCopy }: { label: string; value: string; id: string; copied: string | null; onCopy: (id: string, value: string) => void }) {
  const t = useTranslations(NS);
  const done = copied === id;
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => onCopy(id, value)} aria-label={label} className="shrink-0">
      {done ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      <span aria-live="polite">{done ? t("copied") : t("copy")}</span>
    </Button>
  );
}

function Snippet({ id, code, hint, copied, onCopy }: { id: string; code: string; hint?: string; copied: string | null; onCopy: (id: string, value: string) => void }) {
  const t = useTranslations(NS);
  const label = hint ?? t("commandHint");
  return (
    <div className="overflow-hidden rounded-[var(--radius-inner)] border border-hairline bg-card-inset">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-soft-ink">{label}</span>
        <CopyButton label={t("copyNamed", { name: label })} value={code} id={id} copied={copied} onCopy={onCopy} />
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
  const t = useTranslations(NS);
  const cursorJson = JSON.stringify({ mcpServers: { harly: { url } } }, null, 2);
  const vscodeJson = JSON.stringify({ servers: { harly: { type: "http", url } } }, null, 2);
  const geminiJson = JSON.stringify({ mcpServers: { harly: { httpUrl: url } } }, null, 2);

  const bold = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
  const code = (chunks: React.ReactNode) => <code className="rounded bg-card-inset px-1 py-0.5 font-mono text-[12px]">{chunks}</code>;

  return (
    <Tabs defaultValue="claude" className="gap-4">
      <TabsList variant="line" className="h-auto max-w-full flex-wrap justify-start">
        <TabsTrigger value="claude">Claude</TabsTrigger>
        <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
        <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
        <TabsTrigger value="cursor">Cursor</TabsTrigger>
        <TabsTrigger value="vscode">VS Code</TabsTrigger>
        <TabsTrigger value="other">{t("tabOthers")}</TabsTrigger>
      </TabsList>

      <TabsContent value="claude" className="space-y-3">
        <Steps>
          <li>{t.rich("claudeStep1", { b: bold })}</li>
          <li>{t("claudeStep2")}</li>
          <li>{t.rich("claudeStep3", { b: bold })}</li>
        </Steps>
      </TabsContent>

      <TabsContent value="chatgpt" className="space-y-3">
        <Steps>
          <li>{t.rich("chatgptStep1", { b: bold })}</li>
          <li>{t.rich("chatgptStep2", { b: bold })}</li>
          <li>{t("chatgptStep3")}</li>
        </Steps>
      </TabsContent>

      <TabsContent value="claude-code" className="space-y-3">
        <Snippet id="claude-code" hint={t("terminalHint")} code={`claude mcp add --transport http harly ${url}`} copied={copied} onCopy={onCopy} />
        <p className="text-[13px] text-soft-ink">{t.rich("claudeCodeThen", { code })}</p>
      </TabsContent>

      <TabsContent value="cursor" className="space-y-3">
        <p className="text-[13px] text-soft-ink">{t.rich("cursorIntro", { code })}</p>
        <Snippet id="cursor" hint="mcp.json" code={cursorJson} copied={copied} onCopy={onCopy} />
      </TabsContent>

      <TabsContent value="vscode" className="space-y-3">
        <p className="text-[13px] text-soft-ink">{t.rich("vscodeIntro", { code, b: bold })}</p>
        <Snippet id="vscode" hint="mcp.json" code={vscodeJson} copied={copied} onCopy={onCopy} />
      </TabsContent>

      <TabsContent value="other" className="space-y-3">
        <p className="text-[13px] text-soft-ink">{t("otherIntro")}</p>
        <Snippet id="gemini-cli" hint="Gemini CLI" code={`gemini mcp add --transport http harly ${url}`} copied={copied} onCopy={onCopy} />
        <Snippet id="gemini-json" hint="Gemini CLI settings.json" code={geminiJson} copied={copied} onCopy={onCopy} />
      </TabsContent>
    </Tabs>
  );
}

type Translator = ReturnType<typeof useTranslations>;

function scopeSummary(scopes: string[], t: Translator) {
  const writes = scopes.filter((scope) => /:(write|send)$/.test(scope)).length;
  const reads = scopes.length - writes;
  if (reads && writes) return t("scopesReadWrite", { reads, writes });
  if (reads) return t("scopesRead", { reads });
  if (writes) return t("scopesWrite", { writes });
  return t("scopesNone");
}

function ConnectionRow({ connection, showUser, isYours, busy, onRevoke }: { connection: Connection; showUser: boolean; isYours: boolean; busy: boolean; onRevoke: () => void }) {
  const t = useTranslations(NS);
  const locale = useLocale();
  const writes = connection.scopes.some((scope) => /:(write|send)$/.test(scope));
  const scopes = scopeSummary(connection.scopes, t);
  const connected = formatDistanceToNow(new Date(connection.createdAt), { addSuffix: true, locale: dateFnsLocale(locale) });
  const owner = showUser ? t("owner", { name: connection.userName, email: connection.userEmail }) : "";

  let meta: string;
  if (connection.lastUsedAt) {
    const lastUsed = formatDistanceToNow(new Date(connection.lastUsedAt), { addSuffix: true, locale: dateFnsLocale(locale) });
    meta = showUser
      ? t("metaOwnerUsed", { owner, scopes, connected, lastUsed })
      : t("metaUsed", { scopes, connected, lastUsed });
  } else {
    meta = showUser
      ? t("metaOwnerNeverUsed", { owner, scopes, connected })
      : t("metaNeverUsed", { scopes, connected });
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-near-ink">{connection.clientName}</p>
          <StatusPill tone={writes ? "warn" : "neutral"} dot={false}>
            {writes ? t("canChange") : t("readOnly")}
          </StatusPill>
          {isYours && showUser ? <StatusPill tone="on" dot={false}>{t("you")}</StatusPill> : null}
        </div>
        <p className="text-[12.5px] text-soft-ink">{meta}</p>
        {connection.clientHost ? <p className="truncate text-[12px] text-quiet-mist">{connection.clientHost}</p> : null}
      </div>
      <Button variant="outline" size="sm" onClick={onRevoke} disabled={busy} className="shrink-0 self-start sm:self-center">
        {busy ? t("revoking") : t("revoke")}
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
  const t = useTranslations(NS);
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
        toast.error(result.error ?? t("saveFailed"));
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
      title: own
        ? t("disconnectSelf", { app: connection.clientName })
        : t("disconnectOther", { app: connection.clientName, user: connection.userName }),
      description: t("disconnectDescription"),
      confirmLabel: t("revokeAccess"),
    });
    if (!ok) return;
    setRevokingId(connection.id);
    startTransition(async () => {
      const result = await revokeMcpConnectionAction(connection.id);
      setRevokingId(null);
      if (!result.ok) {
        toast.error(result.error ?? t("revokeFailed"));
        return;
      }
      toast.success(t("revoked"));
      router.refresh();
    });
  }

  const enabled = settings.enabled;

  return (
    <div className="space-y-6">
      <Card className="gap-5 p-6">
        <SectionHeader
          icon={RobotDuotoneIcon}
          title={t("title")}
          description={t("description", { workspace: props.workspaceName })}
          badge={<StatusPill tone={enabled ? "on" : "off"}>{enabled ? t("statusOn") : t("statusOff")}</StatusPill>}
        />

        {!enabled ? (
          <Callout tone="warning" title={t("disabledTitle")}>
            {props.canManage ? t("disabledAdmin") : t("disabledMember")}
          </Callout>
        ) : null}

        {enabled && !settings.allowDcr ? (
          <Callout tone="warning" title={t("dcrTitle")}>
            {props.canManage ? t("dcrAdmin") : t("dcrMember")}
          </Callout>
        ) : null}

        {props.canUse ? (
          <>
            <div>
              <label htmlFor="mcp-server-url" className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-soft-ink">
                {t("serverUrlLabel")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="mcp-server-url"
                  readOnly
                  value={props.serverUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-11 min-w-0 flex-1 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 font-mono text-[13px] text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                />
                <CopyButton label={t("copyServerUrl")} value={props.serverUrl} id="url" copied={copied} onCopy={copy} />
              </div>
            </div>
            <SetupInstructions url={props.serverUrl} copied={copied} onCopy={copy} />
            <p className="text-[12.5px] text-soft-ink">{t("privacyNote")}</p>
          </>
        ) : null}
      </Card>

      {props.canUse ? (
        <Card className="gap-4 p-6">
          <SectionHeader
            icon={PlugsConnectedIcon}
            title={props.canManage ? t("connectedAppsTitle") : t("yourConnectedAppsTitle")}
            description={props.canManage ? t("connectedAppsAdminDesc") : t("connectedAppsMemberDesc")}
          />
          {props.connections.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-8 text-center">
              <p className="text-sm font-medium text-near-ink">{t("noAppsTitle")}</p>
              <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-soft-ink">{t("noAppsHelp")}</p>
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
              title={t("controlsTitle")}
              description={t("controlsDesc")}
            />
          </div>
          <SettingRows>
            <SettingRow
              title={t("allowConnectTitle")}
              description={t("allowConnectDesc")}
              htmlFor="mcp-enabled"
              control={
                <Switch
                  id="mcp-enabled"
                  checked={enabled}
                  disabled={pending}
                  onCheckedChange={(checked) => save({ enabled: checked }, checked ? t("allowConnectOn") : t("allowConnectOff"))}
                />
              }
            />
            <SettingRow
              title={t("appsTitle")}
              description={t("appsDesc")}
              align="start"
            >
              <SegmentedControl
                aria-label={t("appsTitle")}
                value={settings.clientMode}
                options={[
                  { value: "any", label: t("anyApp"), disabled: pending },
                  { value: "known_only", label: t("knownOnly"), disabled: pending },
                ]}
                onValueChange={(value) => save({ clientMode: value }, value === "any" ? t("anyAppSaved") : t("knownOnlySaved"))}
                className="max-w-md"
              />
            </SettingRow>
            <SettingRow
              title={t("dcrSettingTitle")}
              description={t("dcrSettingDesc")}
              htmlFor="mcp-dcr"
              control={
                <Switch
                  id="mcp-dcr"
                  checked={settings.allowDcr}
                  disabled={pending}
                  onCheckedChange={(checked) => save({ allowDcr: checked }, checked ? t("dcrOn") : t("dcrOff"))}
                />
              }
            />
          </SettingRows>
        </Card>
      ) : null}
    </div>
  );
}
