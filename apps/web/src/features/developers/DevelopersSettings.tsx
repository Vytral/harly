"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { dateFnsLocale } from "@/lib/date-fns-locale";
import { useLocale, useTranslations } from "next-intl";
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

/** Message keys for API scopes , raw scope strings surface in a tooltip. */
const SCOPE_KEYS = {
  "jobs:read": "readJobs",
  "jobs:write": "manageJobs",
  "candidates:read": "readCandidates",
  "candidates:write": "manageCandidates",
  "applications:read": "readApplications",
  "applications:write": "manageApplications",
  "webhooks:manage": "manageWebhooks",
} as const;

type Translate = ReturnType<typeof useTranslations>;

function scopeLabel(scope: string, t: Translate): string {
  return scope in SCOPE_KEYS
    ? t(`scopes.${SCOPE_KEYS[scope as keyof typeof SCOPE_KEYS]}`)
    : scope;
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
  const t = useTranslations("features.developers.developersSettings");
  const locale = useLocale();
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
      toast.error(t("toasts.nameRequired"));
      return;
    }
    const scopesForType = selectedScopes.filter((s) =>
      availableScopes.includes(s),
    );
    if (scopesForType.length === 0) {
      toast.error(t("toasts.scopeRequired"));
      return;
    }
    startTransition(async () => {
      const result = await createApiKeyAction({
        name: name.trim(),
        type,
        scopes: scopesForType,
      });
      if (!result.ok || !result.raw) {
        toast.error(result.error ?? t("toasts.createFailed"));
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
        toast.error(result.error ?? t("toasts.revokeFailed"));
        setRevokingId(null);
        return;
      }
      toast.success(t("toasts.revoked"));
      router.refresh();
    });
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={KeyDuotoneIcon}
        title={t("apiKeysTitle")}
        description={t("apiKeysDescription")}
        action={
          canManage ? (
            <Button
              onClick={() => setShowForm((v) => !v)}
              className="transition-transform active:scale-[0.97]"
            >
              <PlusIcon className="size-4" /> {t("newKey")}
            </Button>
          ) : null
        }
      />

      {created && (
        <SecretBanner
          label={t("newKeyBanner")}
          value={created}
          onDismiss={() => setCreated(null)}
        />
      )}

      {showForm && canManage && (
        <div className="animate-in fade-in slide-in-from-top-1 space-y-4 rounded-2xl border bg-muted/20 p-4 duration-200">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("nameLabel")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
              />
            </div>
             <div className="space-y-1.5">
              <Label>{t("typeLabel")}</Label>
              <div className="flex gap-2">
                {(["secret", "publishable"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setType(kind);
                      setSelectedScopes([]);
                    }}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      type === kind
                        ? "border-pine bg-sage text-sage-ink"
                        : "text-muted-foreground hover:border-foreground/15",
                    )}
                  >
                    {kind === "secret" ? t("typeSecret") : t("typePublishable")}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("scopesLabel")}</Label>
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
              {t("scopesHelp")}
            </p>
          </div>
          <Button
            size="sm"
            onClick={submit}
            disabled={pending}
            className="transition-transform active:scale-[0.97]"
          >
            {pending && <SpinnerIcon className="size-4 animate-spin" />} {t("createKey")}
          </Button>
        </div>
      )}

      {apiKeys.length === 0 ? (
        <EmptyRow
          icon={KeyDuotoneIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
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
                      <Badge variant="danger">{t("revoked")}</Badge>
                    ) : (
                      <StatusPill tone={key.environment === "live" ? "on" : "warn"} dot={false}>
                        {key.environment === "live" ? t("live") : t("test")}
                      </StatusPill>
                    )}
                  </div>

                  <p className="mt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {key.type === "secret" ? t("secretKeyType") : t("publishableKeyType")}
                  </p>
                  <div className="mt-1.5">
                    <SecretField
                      value={maskKey(key.prefix, key.last4)}
                      label={key.type === "secret" ? t("secretKeyLabel") : t("publishableKeyLabel")}
                      revealable={false}
                    />
                  </div>

                  {key.scopes.length > 0 && (
                    <div className="mt-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t("permissions")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {key.scopes.map((scope, si) => (
                          <span key={scope} title={scope}>
                            {scopeLabel(scope, t)}
                            {si < key.scopes.length - 1 ? " · " : ""}
                          </span>
                        ))}
                      </p>
                    </div>
                  )}

                  <p className="mt-2.5 text-xs text-muted-foreground">
                    {t("created", { date: format(new Date(key.createdAt), "PP", { locale: dateFnsLocale(locale) }) })}
                  </p>
                </div>

                {canManage && !key.revokedAt && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground"
                        aria-label={t("keyActions")}
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
                        {t("revokeKey")}
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
