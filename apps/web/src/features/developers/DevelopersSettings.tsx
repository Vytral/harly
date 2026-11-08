"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "@/lib/notification-island/toast";

import {
  createApiKeyAction,
  revokeApiKeyAction,
} from "@/features/developers/actions";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import {
  DotsThreeVerticalIcon,
  KeyDuotoneIcon,
  PlusIcon,
  SpinnerIcon,
} from "@/components/ui/icons/phosphor";
import { Badge } from "@/components/ui/badge";
import { SecretField } from "@/components/ui/secret-field";
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
import { cn } from "@/lib/utils";
import { Chip, EmptyRow, SecretBanner } from "@/features/developers/developers-ui";
import {
  WebhooksSection,
  type WebhookView,
} from "@/features/developers/WebhooksSection";
import { EmbedSection } from "@/features/developers/EmbedSection";
import type { EventOption } from "@/features/developers/webhook-ui";

/** Human-readable labels for API scopes , raw scope strings surface in a tooltip. */
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

/** Mask an API key identifier for display , never the full raw secret. */
function maskKey(prefix: string, last4: string): string {
  return `${prefix}${"•".repeat(12)}${last4}`;
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

export function DevelopersSettings(props: {
  canManage: boolean;
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
        publishableKey={props.apiKeys.find(
          (k) => k.type === "publishable" && !k.revokedAt,
        )}
      />
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
            <p className="text-xs text-muted-foreground">
              API keys act across the whole workspace.
            </p>
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
                  <div className="mt-1.5">
                    <SecretField
                      value={maskKey(key.prefix, key.last4)}
                      label={key.type === "secret" ? "secret key" : "publishable key"}
                      revealable={false}
                    />
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
