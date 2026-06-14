"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  KeyRound,
  Loader2,
  Search,
  Globe,
  Sparkles,
} from "lucide-react";

import {
  disableAiAction,
  saveAiSettingsAction,
  searchOpenRouterModelsAction,
  testAiConnectionAction,
} from "@/features/workspaces/ai-settings-actions";
import {
  AI_PROVIDERS,
  formatModelLabel,
  getProvider,
  type AiProviderId,
  type OpenRouterModel,
} from "@/lib/ai/providers";
import type { WorkspaceAiStatus } from "@/lib/ai/config";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/* ── Brand icon SVGs (from better-icons / simple-icons) ── */

function OpenAIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 126" fill="currentColor" className={className}>
      <path d="M365.131 49.074c-7.537 0-12.917 2.575-15.557 7.45l-1.42 2.64v-8.819H335.89v53.61h12.901V72.06c0-7.62 4.142-11.991 11.356-11.991c6.88 0 10.825 4.256 10.825 11.674v32.211h12.907V69.442c0-12.764-7.007-20.368-18.747-20.368m-62.565 0c-15.224 0-24.652 9.5-24.652 24.789v7.527c0 14.703 9.538 23.835 24.893 23.835c10.271 0 17.47-3.763 22-11.504l-7.998-4.602c-3.347 4.465-8.694 7.231-13.997 7.231c-7.773 0-12.413-4.798-12.413-12.84v-2.131h36.008v-8.891c0-14.243-9.352-23.414-23.83-23.414zm12.1 23.638h-24.311v-1.287c0-8.825 4.333-13.695 12.2-13.695c7.576 0 12.101 4.798 12.101 12.84zM512 41.52V31.265h-44.625V41.52h15.646v52.157h-15.646v10.255H512V93.677h-15.651V41.52zM173.638 29.786c-19.93 0-32.32 12.419-32.32 32.42v10.813c0 19.995 12.385 32.42 32.32 32.42s32.321-12.425 32.321-32.42V62.205c-.005-20.022-12.408-32.42-32.321-32.42m18.987 43.973c0 13.279-6.919 20.893-18.987 20.893s-18.982-7.614-18.982-20.893V61.46c0-13.279 6.925-20.893 18.988-20.893S192.63 48.18 192.63 61.46zm53.856-24.685c-6.771 0-12.633 2.805-15.69 7.5l-1.386 2.136v-8.365h-12.27V122.4h12.906V96.3l1.38 2.049c2.904 4.306 8.574 6.875 15.17 6.875c11.125 0 22.35-7.27 22.35-23.518v-9.115c0-11.707-6.919-23.518-22.46-23.518m9.554 32.003c0 8.64-5.04 14.008-13.148 14.008c-7.56 0-12.835-5.675-12.835-13.794v-8.064c0-8.217 5.319-14.002 12.945-14.002c8.047 0 13.048 5.363 13.048 14.002zM419.54 31.27l-26.037 72.684h13.109l4.985-15.58h29.932l.05.154l4.93 15.426h13.104l-26.082-72.69zm-4.744 46.855l11.745-36.748l11.625 36.748zM116.085 51.561a31.37 31.37 0 0 0-2.695-25.774a31.77 31.77 0 0 0-34.184-15.224A31.4 31.4 0 0 0 55.536.001a31.74 31.74 0 0 0-30.278 21.99A31.4 31.4 0 0 0 4.282 37.213a31.77 31.77 0 0 0 3.906 37.218a31.4 31.4 0 0 0 2.695 25.748a31.77 31.77 0 0 0 34.21 15.256a31.4 31.4 0 0 0 23.644 10.562a31.74 31.74 0 0 0 30.278-21.99a31.4 31.4 0 0 0 20.97-15.223a31.73 31.73 0 0 0-3.9-37.224m-47.348 66.22a23.52 23.52 0 0 1-15.108-5.478c.186-.104.548-.285.756-.422l25.09-14.484a4.07 4.07 0 0 0 2.06-3.567V58.453l10.6 6.119a.37.37 0 0 1 .208.296v29.28c0 13.041-10.564 23.618-23.606 23.633M18.015 96.12a23.56 23.56 0 0 1-2.82-15.821c.185.115.514.312.744.443l25.096 14.49a4.08 4.08 0 0 0 4.12 0L75.77 77.528v12.238a.37.37 0 0 1-.148.328L50.26 104.732c-11.292 6.502-25.716 2.637-32.245-8.64zm-6.573-54.782a23.5 23.5 0 0 1 12.287-10.354v29.823a4.08 4.08 0 0 0 2.06 3.567l30.623 17.683l-10.639 6.141a.37.37 0 0 1-.356.033L20.059 73.589c-11.282-6.527-15.148-20.957-8.64-32.25zm87.102 20.27L67.92 43.924l10.59-6.125a.38.38 0 0 1 .355-.033l25.359 14.643a23.61 23.61 0 0 1-3.649 42.598V65.191a4.08 4.08 0 0 0-2.049-3.583zM109.1 45.721a30 30 0 0 0-.745-.444L83.26 30.788a4.08 4.08 0 0 0-4.12 0L48.517 48.466V36.233a.4.4 0 0 1 .154-.328l25.358-14.638a23.61 23.61 0 0 1 35.06 24.46zM42.738 67.546l-10.605-6.119a.4.4 0 0 1-.203-.295V31.85a23.605 23.605 0 0 1 38.714-18.155c-.186.105-.52.285-.756.422l-25.09 14.484a4.08 4.08 0 0 0-2.06 3.567zm5.758-12.418l13.64-7.878l13.635 7.878v15.744l-13.64 7.877l-13.64-7.877z" />
    </svg>
  );
}

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="m4.714 15.956l4.718-2.648l.079-.23l-.08-.128h-.23l-.79-.048l-2.695-.073l-2.337-.097l-2.265-.122l-.57-.121l-.535-.704l.055-.353l.48-.321l.685.06l1.518.104l2.277.157l1.651.098l2.447.255h.389l.054-.158l-.133-.097l-.103-.098l-2.356-1.596l-2.55-1.688l-1.336-.972l-.722-.491L2 6.223l-.158-1.008l.656-.722l.88.06l.224.061l.893.686l1.906 1.476l2.49 1.833l.364.304l.146-.104l.018-.072l-.164-.274l-1.354-2.446l-1.445-2.49l-.644-1.032l-.17-.619a3 3 0 0 1-.103-.729L6.287.133L6.7 0l.995.134l.42.364l.619 1.415L9.735 4.14l1.555 3.03l.455.898l.243.832l.09.255h.159V9.01l.127-1.706l.237-2.095l.23-2.695l.08-.76l.376-.91l.747-.492l.583.28l.48.685l-.067.444l-.286 1.851l-.558 2.903l-.365 1.942h.213l.243-.242l.983-1.306l1.652-2.064l.728-.82l.85-.904l.547-.431h1.032l.759 1.129l-.34 1.166l-1.063 1.347l-.88 1.142l-1.263 1.7l-.79 1.36l.074.11l.188-.02l2.853-.606l1.542-.28l1.84-.315l.832.388l.09.395l-.327.807l-1.967.486l-2.307.462l-3.436.813l-.043.03l.049.061l1.548.146l.662.036h1.62l3.018.225l.79.522l.473.638l-.08.485l-1.213.62l-1.64-.389l-3.825-.91l-1.31-.329h-.183v.11l1.093 1.068l2.003 1.81l2.508 2.33l.127.578l-.321.455l-.34-.049l-2.204-1.657l-.85-.747l-1.925-1.62h-.127v.17l.443.649l2.343 3.521l.122 1.08l-.17.353l-.607.213l-.668-.122l-1.372-1.924l-1.415-2.168l-1.141-1.943l-.14.08l-.674 7.254l-.316.37l-.728.28l-.607-.461l-.322-.747l.322-1.476l.388-1.924l.316-1.53l.285-1.9l.17-.632l-.012-.042l-.14.018l-1.432 1.967l-2.18 2.945l-1.724 1.845l-.413.164l-.716-.37l.066-.662l.401-.589l2.386-3.036l1.439-1.882l.929-1.086l-.006-.158h-.055L4.138 18.56l-1.13.146l-.485-.456l.06-.746l.231-.243l1.907-1.312Z" />
    </svg>
  );
}

function GeminiIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68q.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58a12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68q-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96q2.19.93 3.81 2.55t2.55 3.81" />
    </svg>
  );
}

function XAIIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M14.234 10.162L22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299l-.929-1.329L3.076 1.56h3.182l5.965 8.532l.929 1.329l7.754 11.09h-3.182z" />
    </svg>
  );
}

function OpenRouterIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12s12-5.372 12-12S18.628 0 12 0m5.364 17.366H6.636v-2.232h10.728zm0-4.232H6.636v-2.232h10.728zM6.636 6.634V8.86l10.728.004V6.634Z" />
    </svg>
  );
}

const PROVIDER_ICON: Record<AiProviderId, React.ComponentType<{ className?: string }>> = {
  openai: OpenAIcon,
  anthropic: ClaudeIcon,
  google: GeminiIcon,
  xai: XAIIcon,
  openrouter: OpenRouterIcon,
};

function providerLabel(id: string | null) {
  return id ? (getProvider(id)?.label ?? id) : null;
}

export function AiSettingsCard({
  status,
  canEdit,
}: {
  status: WorkspaceAiStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [togglePending, startToggle] = useTransition();

  const ActiveIcon = status.provider
    ? (PROVIDER_ICON[status.provider as AiProviderId] ?? Sparkles)
    : Sparkles;

  function toggleEnabled(next: boolean) {
    if (!status.hasApiKey && next) {
      toast.error("Configure a provider and API key first.");
      return;
    }
    startToggle(async () => {
      const result = next
        ? await saveAiSettingsAction({
            provider: status.provider ?? "openai",
            modelId: status.modelId ?? "",
            enabled: true,
          })
        : await disableAiAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not update AI settings.");
        return;
      }
      toast.success(next ? "AI enabled" : "AI disabled");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-sage text-sage-ink">
            <Sparkles className="size-4" />
          </span>
          <div className="space-y-1">
            <CardTitle>AI</CardTitle>
            <CardDescription>
              Bring your own provider key to power CV parsing and job-description
              drafting. Without it, Harly uses built-in heuristics.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status.encryptionReady ? (
          <p className="rounded-md border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on
            the server to enable AI features.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {status.hasApiKey ? (
            <>
              <Badge variant="secondary" className="gap-1.5">
                <ActiveIcon className="size-3.5" />
                {providerLabel(status.provider)}
              </Badge>
              {status.modelId ? (
                <Badge variant="outline" className="text-xs">
                  {formatModelLabel(status.modelId)}
                </Badge>
              ) : null}
              <Badge
                className={cn(
                  status.enabled
                    ? "bg-sage text-sage-ink"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {status.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Not configured — using heuristics.
            </span>
          )}
        </div>

        {canEdit ? (
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" disabled={!status.encryptionReady}>
                  <KeyRound className="size-4" />
                  {status.hasApiKey ? "Manage AI" : "Configure AI"}
                </Button>
              </SheetTrigger>
              <AiSettingsForm
                status={status}
                onSaved={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            </Sheet>

            {status.hasApiKey ? (
              <div className="flex items-center gap-2">
                <Switch
                  checked={status.enabled}
                  disabled={togglePending}
                  onCheckedChange={toggleEnabled}
                  aria-label="Enable AI"
                />
                <span className="text-sm text-muted-foreground">
                  {status.enabled ? "On" : "Off"}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AiSettingsForm({
  status,
  onSaved,
}: {
  status: WorkspaceAiStatus;
  onSaved: () => void;
}) {
  const initialProvider = (status.provider as AiProviderId) ?? "openai";
  const [provider, setProvider] = useState<AiProviderId>(initialProvider);
  const [modelId, setModelId] = useState<string>(status.modelId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(status.enabled || !status.hasApiKey);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpenRouterModel[]>([]);
  const [searching, startSearch] = useTransition();
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();

  const info = getProvider(provider);

  // ── Custom endpoint ──
  const [customEndpoint, setCustomEndpoint] = useState(status.baseUrl ?? "");
  const [showCustomEndpoint, setShowCustomEndpoint] = useState(Boolean(status.baseUrl && status.baseUrl !== info?.baseUrl));
  const isOpenRouter = info?.supportsModelSearch ?? false;
  const displayBaseUrl = showCustomEndpoint && customEndpoint ? customEndpoint : info?.baseUrl ?? "";

  function changeProvider(next: string) {
    const id = next as AiProviderId;
    setProvider(id);
    const nextInfo = getProvider(id);
    // Reset model to a sensible default for the new provider.
    setModelId(nextInfo?.models[0]?.id ?? "");
    setResults([]);
    setQuery("");
    // Reset custom endpoint to the provider's default
    if (!showCustomEndpoint) {
      setCustomEndpoint(nextInfo?.baseUrl ?? "");
    }
  }

  function runSearch() {
    startSearch(async () => {
      const found = await searchOpenRouterModelsAction(query);
      setResults(found);
      if (found.length === 0) {
        toast.message("No models found", { description: "Try a different term." });
      }
    });
  }

  function runTest() {
    startTest(async () => {
      const result = await testAiConnectionAction({
        provider,
        modelId,
        apiKey: apiKey || undefined,
        baseUrl: showCustomEndpoint && customEndpoint ? customEndpoint : undefined,
      });
      if (result.ok) {
        toast.success("Connection OK");
      } else {
        toast.error(result.error ?? "Connection failed.");
      }
    });
  }

  function save() {
    startSave(async () => {
      const result = await saveAiSettingsAction({
        provider,
        modelId,
        apiKey: apiKey || undefined,
        baseUrl: showCustomEndpoint && customEndpoint ? customEndpoint : undefined,
        enabled,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("AI settings saved");
      onSaved();
    });
  }

  return (
    <DrawerLayout
      title="Configure AI"
      description="Your API key is encrypted at rest and never shown again."
      footer={
        <>
          <SheetClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={save} disabled={saving || !modelId.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Provider</Label>
            <Select value={provider} onValueChange={changeProvider}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {provider ? (
                    <span className="flex items-center gap-2">
                      {(() => {
                        const Icon = PROVIDER_ICON[provider as AiProviderId];
                        return Icon ? <Icon className="size-4 shrink-0" /> : null;
                      })()}
                      {getProvider(provider)?.label ?? provider}
                    </span>
                  ) : (
                    "Select a provider"
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((option) => {
                  const Icon = PROVIDER_ICON[option.id];
                  return (
                    <SelectItem key={option.id} value={option.id}>
                      <span className="flex items-center gap-2">
                        <Icon className="size-4 shrink-0" />
                        {option.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-model">Model</Label>
          <Input
            id="ai-model"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            placeholder={isOpenRouter ? "e.g. openai/gpt-4o" : "Model id"}
            className="font-mono text-sm"
          />
          {isOpenRouter ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search OpenRouter models (incl. free)…"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      runSearch();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={runSearch}
                  disabled={searching}
                >
                  {searching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                </Button>
              </div>
              {results.length > 0 ? (
                <div className="max-h-52 overflow-y-auto rounded-md border">
                  {results.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setModelId(model.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60",
                        model.id === modelId && "bg-sage/40",
                      )}
                    >
                      <span className="truncate">
                        <span className="font-medium">{model.name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {model.id}
                        </span>
                      </span>
                      {model.free ? (
                        <Badge className="bg-sage text-sage-ink">Free</Badge>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {info?.models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setModelId(model.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition hover:bg-muted",
                    model.id === modelId
                      ? "border-pine bg-sage text-sage-ink"
                      : "text-muted-foreground",
                  )}
                >
                  {model.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-key">API key</Label>
          <Input
            id="ai-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={status.hasApiKey ? "•••••••• (stored — leave blank to keep)" : "Paste your API key"}
            autoComplete="off"
          />
          {info ? (
            <p className="text-xs text-muted-foreground">{info.apiKeyHint}</p>
          ) : null}
        </div>

        {/* Custom endpoint */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowCustomEndpoint(!showCustomEndpoint)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <Globe className="size-3.5" strokeWidth={1.8} />
            {showCustomEndpoint ? "Use default endpoint" : "Custom API endpoint"}
          </button>
          {showCustomEndpoint ? (
            <Input
              value={customEndpoint}
              onChange={(event) => setCustomEndpoint(event.target.value)}
              placeholder={info?.baseUrl ?? "https://api.openai.com/v1"}
              className="font-mono text-sm"
            />
          ) : (
            <p className="rounded-md bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
              {displayBaseUrl}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable AI</p>
            <p className="text-xs text-muted-foreground">
              When off, Harly uses heuristics only.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={runTest}
          disabled={testing || !modelId.trim()}
        >
          {testing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Test connection
        </Button>
      </div>
    </DrawerLayout>
  );
}
