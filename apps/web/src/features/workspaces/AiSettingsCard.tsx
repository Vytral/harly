"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bot,
  Brain,
  Check,
  Gem,
  KeyRound,
  Loader2,
  Network,
  Search,
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

const PROVIDER_ICON: Record<
  AiProviderId,
  React.ComponentType<{ className?: string }>
> = {
  openai: Sparkles,
  anthropic: Brain,
  google: Gem,
  xai: Bot,
  openrouter: Network,
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
              drafting. Without it, OpenHire uses built-in heuristics.
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
                <Badge variant="outline" className="font-mono text-xs">
                  {status.modelId}
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
  const isOpenRouter = info?.supportsModelSearch ?? false;

  function changeProvider(next: string) {
    const id = next as AiProviderId;
    setProvider(id);
    const nextInfo = getProvider(id);
    // Reset model to a sensible default for the new provider.
    setModelId(nextInfo?.models[0]?.id ?? "");
    setResults([]);
    setQuery("");
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
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((option) => {
                const Icon = PROVIDER_ICON[option.id];
                return (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="flex items-center gap-2">
                      <Icon className="size-4" />
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

        <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable AI</p>
            <p className="text-xs text-muted-foreground">
              When off, OpenHire uses heuristics only.
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
