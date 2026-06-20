"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createApiKeyAction,
  createWebhookAction,
  deleteWebhookAction,
  revokeApiKeyAction,
  testWebhookAction,
  updateWebhookAction,
} from "@/features/developers/actions";
import { SectionHeader } from "@/features/workspaces/settings-ui";
import {
  CodeDuotoneIcon,
  CopyIcon,
  KeyDuotoneIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
  WebhooksDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type ApiKeyView = {
  id: string;
  name: string;
  type: string;
  environment: string;
  prefix: string;
  last4: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type WebhookView = {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  createdAt: string;
};

type EventOption = { value: string; label: string };

export function DevelopersSettings(props: {
  canManage: boolean;
  workspaceSlug: string;
  appUrl: string;
  apiKeys: ApiKeyView[];
  webhooks: WebhookView[];
  scopes: string[];
  publishableScopes: string[];
  webhookEvents: EventOption[];
}) {
  return (
    <div className="space-y-6">
      <ApiKeysSection
        canManage={props.canManage}
        apiKeys={props.apiKeys}
        scopes={props.scopes}
        publishableScopes={props.publishableScopes}
      />
      <WebhooksSection
        canManage={props.canManage}
        webhooks={props.webhooks}
        events={props.webhookEvents}
      />
      <EmbedSection
        appUrl={props.appUrl}
        workspaceSlug={props.workspaceSlug}
        publishableKey={props.apiKeys.find(
          (k) => k.type === "publishable" && !k.revokedAt,
        )}
      />
    </div>
  );
}

function copy(value: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success("Copied"),
    () => toast.error("Could not copy"),
  );
}

/** Toggle chip used for scope/event multi-select. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
        active
          ? "border-pine/40 bg-sage/50 text-sage-ink"
          : "bg-card text-muted-foreground hover:border-foreground/15 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SecretBanner({
  label,
  value,
  onDismiss,
}: {
  label: string;
  value: string;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-2xl border border-pine/30 bg-sage/40 p-3 text-sm">
      <p className="font-medium text-sage-ink">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Copy it now — you won&apos;t be able to see it again.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg bg-background px-2 py-1.5 font-mono text-xs">
          {value}
        </code>
        <Button size="sm" variant="outline" onClick={() => copy(value)}>
          <CopyIcon className="size-3.5" /> Copy
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}

function ApiKeysSection({
  canManage,
  apiKeys,
  scopes,
  publishableScopes,
}: {
  canManage: boolean;
  apiKeys: ApiKeyView[];
  scopes: string[];
  publishableScopes: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"secret" | "publishable">("secret");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [created, setCreated] = useState<string | null>(null);

  const availableScopes = useMemo(
    () => (type === "publishable" ? publishableScopes : scopes),
    [type, scopes, publishableScopes],
  );

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  function submit() {
    if (!name.trim()) {
      toast.error("Name the key.");
      return;
    }
    const scopesForType = selectedScopes.filter((s) =>
      availableScopes.includes(s),
    );
    if (scopesForType.length === 0) {
      toast.error("Pick at least one scope.");
      return;
    }
    startTransition(async () => {
      const result = await createApiKeyAction({
        name: name.trim(),
        type,
        scopes: scopesForType,
      });
      if (!result.ok || !result.raw) {
        toast.error(result.error ?? "Could not create key.");
        return;
      }
      setCreated(result.raw);
      setName("");
      setSelectedScopes([]);
      setShowForm(false);
      router.refresh();
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      const result = await revokeApiKeyAction(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not revoke.");
        return;
      }
      toast.success("Key revoked");
      router.refresh();
    });
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={KeyDuotoneIcon}
        title="API keys"
        description="Secret keys for server integrations, publishable keys for the embed widget."
        action={
          canManage ? (
            <Button onClick={() => setShowForm((v) => !v)}>
              <PlusIcon className="size-4" /> New key
            </Button>
          ) : null
        }
      />

      {created && (
        <SecretBanner
          label="Your new API key"
          value={created}
          onDismiss={() => setCreated(null)}
        />
      )}

      {showForm && canManage && (
        <div className="space-y-4 rounded-2xl border bg-muted/20 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production server"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex gap-2">
                {(["secret", "publishable"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setType(t);
                      setSelectedScopes([]);
                    }}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      type === t
                        ? "border-pine bg-sage text-sage-ink"
                        : "text-muted-foreground hover:border-foreground/15",
                    )}
                  >
                    {t === "secret" ? "Secret (sk)" : "Publishable (pk)"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Scopes</Label>
            <div className="flex flex-wrap gap-1.5">
              {availableScopes.map((scope) => (
                <Chip
                  key={scope}
                  active={selectedScopes.includes(scope)}
                  onClick={() => toggleScope(scope)}
                >
                  <code className="font-mono">{scope}</code>
                </Chip>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending && <SpinnerIcon className="size-4" />} Create key
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border">
        {apiKeys.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No API keys yet.
          </p>
        )}
        <ul className="divide-y">
          {apiKeys.map((key) => (
            <li
              key={key.id}
              className="flex items-center justify-between gap-3 px-4 py-3.5"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                  <KeyDuotoneIcon className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {key.type === "secret" ? "sk" : "pk"}
                    </Badge>
                    {key.revokedAt && (
                      <Badge className="bg-destructive/10 text-destructive">
                        Revoked
                      </Badge>
                    )}
                  </div>
                  <code className="mt-0.5 block font-mono text-xs text-muted-foreground">
                    {key.prefix}…{key.last4}
                  </code>
                  {key.scopes.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {canManage && !key.revokedAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => revoke(key.id)}
                  disabled={pending}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function WebhooksSection({
  canManage,
  webhooks,
  events,
}: {
  canManage: boolean;
  webhooks: WebhookView[];
  events: EventOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);

  function toggleEvent(value: string) {
    setSelectedEvents((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function submit() {
    if (!/^https?:\/\//.test(url)) {
      toast.error("Enter a valid http(s) URL.");
      return;
    }
    if (selectedEvents.length === 0) {
      toast.error("Subscribe to at least one event.");
      return;
    }
    startTransition(async () => {
      const result = await createWebhookAction({ url, events: selectedEvents });
      if (!result.ok || !result.secret) {
        toast.error(result.error ?? "Could not create webhook.");
        return;
      }
      setSecret(result.secret);
      setUrl("");
      setSelectedEvents([]);
      setShowForm(false);
      router.refresh();
    });
  }

  function toggleEnabled(id: string, enabled: boolean) {
    startTransition(async () => {
      const result = await updateWebhookAction({ id, enabled });
      if (!result.ok) toast.error(result.error ?? "Could not update.");
      else router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteWebhookAction(id);
      if (!result.ok) toast.error(result.error ?? "Could not delete.");
      else {
        toast.success("Webhook deleted");
        router.refresh();
      }
    });
  }

  function test(id: string) {
    startTransition(async () => {
      const result = await testWebhookAction(id);
      if (result.ok) toast.success("Test delivered");
      else toast.error(result.error ?? `Test failed (${result.status ?? "?"})`);
      router.refresh();
    });
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={WebhooksDuotoneIcon}
        title="Webhooks"
        description="Receive signed events when applications and jobs change."
        action={
          canManage ? (
            <Button onClick={() => setShowForm((v) => !v)}>
              <PlusIcon className="size-4" /> Add endpoint
            </Button>
          ) : null
        }
      />

      {secret && (
        <SecretBanner
          label="Signing secret"
          value={secret}
          onDismiss={() => setSecret(null)}
        />
      )}

      {showForm && canManage && (
        <div className="space-y-4 rounded-2xl border bg-muted/20 p-4">
          <div className="space-y-1.5">
            <Label>Endpoint URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/harly"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Events</Label>
            <div className="flex flex-wrap gap-1.5">
              {events.map((event) => (
                <Chip
                  key={event.value}
                  active={selectedEvents.includes(event.value)}
                  onClick={() => toggleEvent(event.value)}
                >
                  {event.label}
                </Chip>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending && <SpinnerIcon className="size-4" />} Create endpoint
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border">
        {webhooks.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No webhook endpoints yet.
          </p>
        )}
        <ul className="divide-y">
          {webhooks.map((hook) => (
            <li
              key={hook.id}
              className="flex items-center justify-between gap-3 px-4 py-3.5"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                  <WebhooksDuotoneIcon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-medium">
                    {hook.url}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {hook.events.map((event) => (
                      <span
                        key={event}
                        className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Switch
                    checked={hook.enabled}
                    onCheckedChange={(v) => toggleEnabled(hook.id, v)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => test(hook.id)}
                  >
                    Test
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove(hook.id)}
                    aria-label="Delete webhook"
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function EmbedSection({
  appUrl,
  workspaceSlug,
  publishableKey,
}: {
  appUrl: string;
  workspaceSlug: string;
  publishableKey?: ApiKeyView;
}) {
  const pkAttr = publishableKey
    ? `\n        data-pk="${publishableKey.prefix}…"`
    : "";
  const snippet = `<div id="openhire-jobs-container"></div>
<script
  src="${appUrl}/embed/widget.js"
  data-workspace="${workspaceSlug}"${pkAttr}
  defer
></script>`;

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={CodeDuotoneIcon}
        title="Embed widget"
        description="Drop this into any careers page to render your open roles with inline apply."
        action={
          <Button variant="outline" onClick={() => copy(snippet)}>
            <CopyIcon className="size-4" /> Copy snippet
          </Button>
        }
      />

      <pre className="overflow-x-auto rounded-2xl border bg-muted/40 p-4 text-xs leading-relaxed">
        <code>{snippet}</code>
      </pre>

      {publishableKey ? (
        <p className="text-xs text-muted-foreground">
          Replace the masked <code className="font-mono">data-pk</code> with your
          full publishable key.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Create a publishable key above for per-embed analytics and revocation
          (optional — the widget also works with just the workspace slug).
        </p>
      )}
    </Card>
  );
}
