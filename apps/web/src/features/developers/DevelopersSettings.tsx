"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
  Webhook,
} from "lucide-react";

import {
  createApiKeyAction,
  createWebhookAction,
  deleteWebhookAction,
  revokeApiKeyAction,
  testWebhookAction,
  updateWebhookAction,
} from "@/features/developers/actions";
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
    <div className="rounded-lg border border-pine/30 bg-sage/40 p-3 text-sm">
      <p className="font-medium text-sage-ink">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Copy it now — you won&apos;t be able to see it again.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 font-mono text-xs">
          {value}
        </code>
        <Button size="sm" variant="outline" onClick={() => copy(value)}>
          <Copy className="size-3.5" /> Copy
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
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sage text-sage-ink">
            <KeyRound className="size-4" />
          </span>
          <div>
            <h3 className="font-semibold tracking-tight">API keys</h3>
            <p className="text-sm text-muted-foreground">
              Secret keys for server integrations, publishable keys for the embed
              widget.
            </p>
          </div>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="size-4" /> New key
          </Button>
        )}
      </div>

      {created && (
        <div className="mt-4">
          <SecretBanner
            label="Your new API key"
            value={created}
            onDismiss={() => setCreated(null)}
          />
        </div>
      )}

      {showForm && canManage && (
        <div className="mt-4 space-y-3 rounded-lg border p-4">
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
                    "rounded-lg border px-3 py-1.5 text-sm",
                    type === t
                      ? "border-pine bg-sage text-sage-ink"
                      : "text-muted-foreground",
                  )}
                >
                  {t === "secret" ? "Secret (sk)" : "Publishable (pk)"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Scopes</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {availableScopes.map((scope) => (
                <label
                  key={scope}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  <code className="font-mono text-xs">{scope}</code>
                </label>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} Create key
          </Button>
        </div>
      )}

      <div className="mt-4 divide-y">
        {apiKeys.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">No API keys yet.</p>
        )}
        {apiKeys.map((key) => (
          <div
            key={key.id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{key.name}</span>
                <Badge className="bg-muted text-muted-foreground">
                  {key.type === "secret" ? "sk" : "pk"}
                </Badge>
                {key.revokedAt && (
                  <Badge className="bg-destructive/10 text-destructive">
                    revoked
                  </Badge>
                )}
              </div>
              <code className="font-mono text-xs text-muted-foreground">
                {key.prefix}…{key.last4}
              </code>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {key.scopes.join(", ")}
              </p>
            </div>
            {canManage && !key.revokedAt && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => revoke(key.id)}
                disabled={pending}
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
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
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sage text-sage-ink">
            <Webhook className="size-4" />
          </span>
          <div>
            <h3 className="font-semibold tracking-tight">Webhooks</h3>
            <p className="text-sm text-muted-foreground">
              Receive signed events when applications and jobs change.
            </p>
          </div>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="size-4" /> Add endpoint
          </Button>
        )}
      </div>

      {secret && (
        <div className="mt-4">
          <SecretBanner
            label="Signing secret"
            value={secret}
            onDismiss={() => setSecret(null)}
          />
        </div>
      )}

      {showForm && canManage && (
        <div className="mt-4 space-y-3 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Label>Endpoint URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/harly"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Events</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {events.map((event) => (
                <label
                  key={event.value}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event.value)}
                    onChange={() => toggleEvent(event.value)}
                  />
                  <span>{event.label}</span>
                </label>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} Create
            endpoint
          </Button>
        </div>
      )}

      <div className="mt-4 divide-y">
        {webhooks.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            No webhook endpoints yet.
          </p>
        )}
        {webhooks.map((hook) => (
          <div
            key={hook.id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{hook.url}</p>
              <p className="text-xs text-muted-foreground">
                {hook.events.join(", ")}
              </p>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={hook.enabled}
                  onCheckedChange={(v) => toggleEnabled(hook.id, v)}
                />
                <Button size="sm" variant="ghost" onClick={() => test(hook.id)}>
                  Test
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(hook.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
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
    <Card className="p-5">
      <h3 className="font-semibold tracking-tight">Embed widget</h3>
      <p className="text-sm text-muted-foreground">
        Drop this into any careers page to render your open roles with inline
        apply.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
        <code>{snippet}</code>
      </pre>
      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        onClick={() => copy(snippet)}
      >
        <Copy className="size-3.5" /> Copy snippet
      </Button>
      {publishableKey ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Replace the masked <code>data-pk</code> with your full publishable key.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Create a publishable key above for per-embed analytics and revocation
          (optional — the widget also works with just the workspace slug).
        </p>
      )}
    </Card>
  );
}
