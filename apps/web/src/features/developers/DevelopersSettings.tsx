"use client";

import { useMemo, useState, useTransition, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

import {
  createApiKeyAction,
  createWebhookAction,
  deleteWebhookAction,
  revokeApiKeyAction,
  testWebhookAction,
  updateWebhookAction,
} from "@/features/developers/actions";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import {
  CheckIcon,
  CodeDuotoneIcon,
  CopyIcon,
  DotsThreeVerticalIcon,
  KeyDuotoneIcon,
  PlusIcon,
  SpinnerIcon,
  WebhooksDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Human-readable labels for API scopes — raw scope strings surface in a tooltip. */
const SCOPE_LABELS: Record<string, string> = {
  "jobs:read": "Read jobs",
  "jobs:write": "Manage jobs",
  "candidates:read": "Read candidates",
  "candidates:write": "Manage candidates",
  "applications:read": "Read applications",
  "applications:write": "Manage applications",
  "webhooks:manage": "Manage webhooks",
};

function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}

const MAX_VISIBLE_EVENTS = 2;

/** Mask an API key identifier for display — never the full raw secret. */
function maskKey(prefix: string, last4: string): string {
  return `${prefix}${"•".repeat(12)}${last4}`;
}

type WebhookDeliverySummary = {
  status: string;
  responseStatus: number | null;
  deliveredAt: string | null;
  createdAt: string;
} | null;

function deliveryLabel(delivery: WebhookDeliverySummary): string {
  if (!delivery) return "No deliveries yet";
  const when = formatDistanceToNow(new Date(delivery.deliveredAt ?? delivery.createdAt), {
    addSuffix: true,
  });
  if (delivery.status === "success") return `Delivered ${when}`;
  if (delivery.status === "pending") return "Delivery pending";
  const statusSuffix = delivery.responseStatus ? ` (${delivery.responseStatus})` : "";
  return `Delivery failed ${when}${statusSuffix}`;
}

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
  lastDelivery: WebhookDeliverySummary;
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
  children: ReactNode;
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

function EmptyRow({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
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
    <div className="animate-in fade-in zoom-in-95 duration-200 rounded-2xl border border-pine/30 bg-sage/40 p-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
      <p className="font-medium text-sage-ink">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Copy it now — you won&apos;t be able to see it again.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg bg-background px-2 py-1.5 font-mono text-xs">
          {value}
        </code>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 transition-transform active:scale-[0.97]"
          onClick={() => copy(value)}
        >
          <CopyIcon className="size-3.5" /> Copy
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 transition-transform active:scale-[0.97]"
          onClick={onDismiss}
        >
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
  const [revokingId, setRevokingId] = useState<string | null>(null);

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
    setRevokingId(id);
    startTransition(async () => {
      const result = await revokeApiKeyAction(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not revoke.");
        setRevokingId(null);
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
            <Button
              onClick={() => setShowForm((v) => !v)}
              className="transition-transform active:scale-[0.97]"
            >
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
        <div className="animate-in fade-in slide-in-from-top-1 space-y-4 rounded-2xl border bg-muted/20 p-4 duration-200">
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
          <Button
            size="sm"
            onClick={submit}
            disabled={pending}
            className="transition-transform active:scale-[0.97]"
          >
            {pending && <SpinnerIcon className="size-4 animate-spin" />} Create key
          </Button>
        </div>
      )}

      {apiKeys.length === 0 ? (
        <EmptyRow
          icon={KeyDuotoneIcon}
          title="No API keys yet"
          description="Create one to authenticate server-to-server requests or power the embed widget."
        />
      ) : (
        <div className="space-y-2">
          {apiKeys.map((key, i) => (
            <div
              key={key.id}
              className="animate-in fade-in slide-in-from-bottom-1 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-foreground/15"
              style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{key.name}</span>
                    {key.revokedAt ? (
                      <Badge variant="danger">Revoked</Badge>
                    ) : (
                      <StatusPill tone={key.environment === "live" ? "on" : "warn"} dot={false}>
                        {key.environment === "live" ? "Live" : "Test"}
                      </StatusPill>
                    )}
                  </div>

                  <p className="mt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {key.type === "secret" ? "Secret key" : "Publishable key"}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-muted/50 px-2.5 py-1.5 font-mono text-xs">
                      {maskKey(key.prefix, key.last4)}
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(maskKey(key.prefix, key.last4))}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
                    >
                      <CopyIcon className="size-3.5" /> Copy
                    </button>
                  </div>

                  {key.scopes.length > 0 && (
                    <div className="mt-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Permissions
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {key.scopes.map((scope, si) => (
                          <span key={scope} title={scope}>
                            {scopeLabel(scope)}
                            {si < key.scopes.length - 1 ? " · " : ""}
                          </span>
                        ))}
                      </p>
                    </div>
                  )}

                  <p className="mt-2.5 text-xs text-muted-foreground">
                    Created {format(new Date(key.createdAt), "PP")}
                  </p>
                </div>

                {canManage && !key.revokedAt && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground"
                        aria-label="Key actions"
                      >
                        <DotsThreeVerticalIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={pending && revokingId === key.id}
                        onClick={() => revoke(key.id)}
                      >
                        {pending && revokingId === key.id && (
                          <SpinnerIcon className="size-3.5 animate-spin" />
                        )}
                        Revoke key
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
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
  const [testingId, setTestingId] = useState<string | null>(null);

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
    setTestingId(id);
    startTransition(async () => {
      const result = await testWebhookAction(id);
      if (result.ok) toast.success("Test delivered");
      else toast.error(result.error ?? `Test failed (${result.status ?? "?"})`);
      setTestingId(null);
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
            <Button
              onClick={() => setShowForm((v) => !v)}
              className="transition-transform active:scale-[0.97]"
            >
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
        <div className="animate-in fade-in slide-in-from-top-1 space-y-4 rounded-2xl border bg-muted/20 p-4 duration-200">
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
          <Button
            size="sm"
            onClick={submit}
            disabled={pending}
            className="transition-transform active:scale-[0.97]"
          >
            {pending && <SpinnerIcon className="size-4 animate-spin" />} Create
            endpoint
          </Button>
        </div>
      )}

      {webhooks.length === 0 ? (
        <EmptyRow
          icon={WebhooksDuotoneIcon}
          title="No webhook endpoints yet"
          description="Add one to get signed events when applications and jobs change."
        />
      ) : (
        <div className="space-y-2">
          {webhooks.map((hook, i) => {
            const eventLabelOf = (value: string) =>
              events.find((e) => e.value === value)?.label ?? value;
            const visibleEvents = hook.events.slice(0, MAX_VISIBLE_EVENTS);
            const overflowCount = hook.events.length - visibleEvents.length;

            return (
              <div
                key={hook.id}
                className="animate-in fade-in slide-in-from-bottom-1 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-foreground/15"
                style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-mono text-sm font-medium">{hook.url}</p>
                      <StatusPill tone={hook.enabled ? "on" : "off"}>
                        {hook.enabled ? "Active" : "Inactive"}
                      </StatusPill>
                    </div>

                    <p className="mt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Subscribed events
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                      {visibleEvents.map((event, ei) => (
                        <span key={event} title={event}>
                          {eventLabelOf(event)}
                          {ei < visibleEvents.length - 1 ? " ·" : ""}
                        </span>
                      ))}
                      {overflowCount > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="rounded-md px-1.5 py-0.5 font-medium text-pine transition-colors hover:bg-sage/40"
                            >
                              +{overflowCount} more
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-64 p-3">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              All subscribed events
                            </p>
                            <div className="mt-2 space-y-1">
                              {hook.events.map((event) => (
                                <p key={event} title={event} className="text-sm">
                                  {eventLabelOf(event)}
                                </p>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>

                    <p className="mt-2.5 text-xs text-muted-foreground">
                      {deliveryLabel(hook.lastDelivery)}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => test(hook.id)}
                        disabled={pending}
                      >
                        {pending && testingId === hook.id && (
                          <SpinnerIcon className="size-3.5 animate-spin" />
                        )}
                        Send test
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground"
                            aria-label="Webhook actions"
                          >
                            <DotsThreeVerticalIcon className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => toggleEnabled(hook.id, !hook.enabled)}>
                            {hook.enabled ? "Disable endpoint" : "Enable endpoint"}
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => remove(hook.id)}>
                            Delete endpoint
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const [copied, setCopied] = useState(false);

  const pkAttr = publishableKey
    ? `\n  data-pk="${publishableKey.prefix}…"`
    : "";
  const snippet = `<div id="harly-jobs-container"></div>
<script
  src="${appUrl}/embed/widget.js"
  data-workspace="${workspaceSlug}"${pkAttr}
  defer
></script>`;

  function handleCopy() {
    copy(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
     <Card className="gap-5 p-6">
      <SectionHeader
        icon={CodeDuotoneIcon}
        title="Embed widget"
        description="Drop this into any careers page to render your open roles with inline apply."
      />

      <div className="overflow-hidden rounded-2xl border bg-muted/30">
        <div className="flex items-center justify-between border-b bg-muted/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-destructive/40" />
              <span className="size-2.5 rounded-full bg-clay/40" />
              <span className="size-2.5 rounded-full bg-pine/40" />
            </span>
            <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              HTML
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
          >
            {copied ? (
              <>
                <CheckIcon className="size-3.5 text-pine" /> Copied
              </>
            ) : (
              <>
                <CopyIcon className="size-3.5" /> Copy
              </>
            )}
          </button>
        </div>
        <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
          <code>{snippet}</code>
        </pre>
      </div>

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
