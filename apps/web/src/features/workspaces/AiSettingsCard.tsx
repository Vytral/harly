"use client";

import { useState, useTransition } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import {
  disableAiAction,
  saveAiSettingsAction,
  saveAiAutoScoreAction,
  saveAiDuplicateCheckAction,
  saveAiResumeAnonymizationAction,
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
import {
  BrandTile,
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyCheck, EyeOff, Gauge, ScanText, Wand2 } from "lucide-react";
import {
  ClaudeLogo,
  GeminiLogo,
  OpenAiLogo,
  OpenRouterLogo,
  XaiLogo,
} from "@/components/ui/icons/brands";
import {
  CheckIcon,
  GlobeIcon,
  KeyDuotoneIcon,
  LightningIcon,
  RobotDuotoneIcon,
  SearchIcon,
  SpinnerIcon,
} from "@/components/ui/icons/phosphor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingRow, SettingRows } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const PROVIDER_LOGO: Record<
  AiProviderId,
  React.ComponentType<{ className?: string }>
> = {
  openai: OpenAiLogo,
  anthropic: ClaudeLogo,
  google: GeminiLogo,
  xai: XaiLogo,
  openrouter: OpenRouterLogo,
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
  const [togglePending, startToggle] = useTransition();

  const ActiveLogo = status.provider
    ? (PROVIDER_LOGO[status.provider as AiProviderId] ?? null)
    : null;

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
    <div className="space-y-5">
      {!status.encryptionReady ? <EncryptionWarning /> : null}

      {/* Provider config card */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="p-6">
          <SectionHeader
            icon={RobotDuotoneIcon}
            title="AI"
            badge={
              status.hasApiKey ? (
                <StatusPill tone={status.enabled ? "on" : "off"}>
                  {status.enabled ? "Active" : "Paused"}
                </StatusPill>
              ) : (
                <StatusPill tone="neutral">Using heuristics</StatusPill>
              )
            }
            description="Bring your own provider key to power resume parsing and job-description drafting. Without one, Harly falls back to fast built-in heuristics."
            action={
              canEdit ? (
                <>
                  {status.encryptionReady ? (
                    <Button
                      asChild
                      variant={status.hasApiKey ? "outline" : "default"}
                    >
                      <Link href={"/settings/ai/configure" as Route}>
                        <KeyDuotoneIcon className="size-4" />
                        {status.hasApiKey ? "Manage" : "Configure AI"}
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="default" disabled>
                      <KeyDuotoneIcon className="size-4" />
                      Configure AI
                    </Button>
                  )}
                  {status.hasApiKey ? (
                    <label className="flex h-9 items-center gap-2 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 text-sm">
                      <Switch
                        checked={status.enabled}
                        disabled={togglePending}
                        onCheckedChange={toggleEnabled}
                        aria-label="Enable AI"
                      />
                      <span className="text-muted-foreground">
                        {status.enabled ? "On" : "Off"}
                      </span>
                    </label>
                  ) : null}
                </>
              ) : null
            }
          />

          {status.hasApiKey ? (
            <div className="mt-4 grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <StatCell label="Provider">
                {ActiveLogo ? <ActiveLogo className="size-4" /> : null}
                {providerLabel(status.provider)}
              </StatCell>
              <StatCell label="Model">
                <span className="truncate font-mono text-[13px]">
                  {status.modelId
                    ? formatModelLabel(status.modelId)
                    : "Not configured"}
                </span>
              </StatCell>
              <StatCell label="Endpoint">
                <span className="truncate text-muted-foreground">
                  {status.baseUrl ?? "Provider default"}
                </span>
              </StatCell>
            </div>
          ) : null}
        </div>
      </Card>

      {/* AI features: one card of rows, icon + one line each. */}
      <Card className="gap-0 py-0">
        <div className="px-5 pt-5 pb-1">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-near-ink">
            AI features
          </h2>
        </div>
        <SettingRows>
          <FeatureRow
            icon={<ScanText strokeWidth={1.8} />}
            title="Resume parsing"
            description="Turns uploaded CVs into structured candidate profiles."
          />
          <FeatureRow
            icon={<Wand2 strokeWidth={1.8} />}
            title="Job-description drafting"
            description="Drafts a job posting from a short brief."
          />
          <AutoScoreFeatureCard status={status} canEdit={canEdit} />
          <DuplicateCheckFeatureCard status={status} canEdit={canEdit} />
          <ResumeAnonymizationFeatureCard status={status} canEdit={canEdit} />
        </SettingRows>
      </Card>

      {/* Supported providers */}
      <Card className="gap-4">
        <div className="px-6">
          <h3 className="text-sm font-semibold tracking-tight">
            Works with your provider
          </h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Bring a key from any major provider, or route through OpenRouter for
            hundreds of models, including free ones. Keys are encrypted at rest.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 px-6 sm:grid-cols-3 lg:grid-cols-5">
          {AI_PROVIDERS.map((provider) => {
            const Logo = PROVIDER_LOGO[provider.id];
            const isActive =
              status.provider === provider.id && status.hasApiKey;
            return (
              <div
                key={provider.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
                  isActive
                    ? "border-pine/40 bg-sage/40"
                    : "bg-card hover:border-foreground/15",
                )}
              >
                <BrandTile className="size-8 rounded-lg">
                  <Logo className="size-4" />
                </BrandTile>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {provider.label}
                  </span>
                  {isActive ? (
                    <span className="block text-[11px] font-medium text-pine">
                      Connected
                    </span>
                  ) : provider.supportsModelSearch ? (
                    <span className="block text-[11px] text-muted-foreground">
                      100s of models
                    </span>
                  ) : (
                    <span className="block text-[11px] text-muted-foreground">
                      {provider.models.length} models
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function EncryptionWarning() {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
      <GlobeIcon className="mt-0.5 size-4 shrink-0" />
      <p>
        Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on the
        server to enable AI features.
      </p>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <SettingRow
      icon={icon}
      title={title}
      description={description}
      control={
        <span className="rounded-full bg-sage-wash px-2 py-0.5 text-[11.5px] font-medium text-sage-ink">
          Always on
        </span>
      }
    />
  );
}

/** Why a model-backed toggle is locked, in one quiet line. */
function LockedHint({ status }: { status: WorkspaceAiStatus }) {
  if (!status.hasApiKey) {
    return <p className="text-[12.5px] text-soft-ink">Connect a provider to turn this on.</p>;
  }
  if (!status.enabled) {
    return <p className="text-[12.5px] text-warning-clay">Enable AI above to turn this on.</p>;
  }
  return null;
}

function AutoScoreFeatureCard({
  status,
  canEdit,
}: {
  status: WorkspaceAiStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startToggle] = useTransition();
  const [optimistic, setOptimistic] = useState(status.autoScore);

  const disabled = !status.enabled || !status.hasApiKey || !canEdit;

  function toggle(next: boolean) {
    setOptimistic(next);
    startToggle(async () => {
      const result = await saveAiAutoScoreAction(next);
      if (!result.ok) {
        setOptimistic(!next);
        toast.error(result.error ?? "Could not update setting.");
        return;
      }
      toast.success(next ? "Auto-scoring enabled" : "Auto-scoring disabled");
      router.refresh();
    });
  }

  return (
      <SettingRow
        icon={<Gauge strokeWidth={1.8} />}
        title="Auto-score applications"
        description="Scores every new application as it arrives."
        control={
          <Switch
          checked={optimistic}
              onCheckedChange={toggle}
              disabled={disabled || pending}
              aria-label="Auto-score applications"
          />
        }
      >
        <LockedHint status={status} />
      </SettingRow>
  );
}

function DuplicateCheckFeatureCard({
  status,
  canEdit,
}: {
  status: WorkspaceAiStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startToggle] = useTransition();
  const [optimistic, setOptimistic] = useState(status.duplicateCheck);

  const disabled = !status.enabled || !status.hasApiKey || !canEdit;

  function toggle(next: boolean) {
    setOptimistic(next);
    startToggle(async () => {
      const result = await saveAiDuplicateCheckAction(next);
      if (!result.ok) {
        setOptimistic(!next);
        toast.error(result.error ?? "Could not update setting.");
        return;
      }
      toast.success(
        next ? "Duplicate detection enabled" : "Duplicate detection disabled",
      );
      router.refresh();
    });
  }

  return (
      <SettingRow
        icon={<CopyCheck strokeWidth={1.8} />}
        title="Duplicate detection"
        description="Flags likely duplicate candidates when someone applies."
        control={
          <Switch
          checked={optimistic}
              onCheckedChange={toggle}
              disabled={disabled || pending}
              aria-label="Duplicate detection"
          />
        }
      >
        <LockedHint status={status} />
      </SettingRow>
  );
}

function ResumeAnonymizationFeatureCard({
  status,
  canEdit,
}: {
  status: WorkspaceAiStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startToggle] = useTransition();
  const [optimistic, setOptimistic] = useState(status.resumeAnonymization);

  // Redaction is deterministic (no model call), so it only needs edit rights ,
  // not an enabled provider like the model-backed features above.
  const disabled = !canEdit;

  function toggle(next: boolean) {
    setOptimistic(next);
    startToggle(async () => {
      const result = await saveAiResumeAnonymizationAction(next);
      if (!result.ok) {
        setOptimistic(!next);
        toast.error(result.error ?? "Could not update setting.");
        return;
      }
      toast.success(
        next ? "Resume anonymization enabled" : "Resume anonymization disabled",
      );
      router.refresh();
    });
  }

  return (
      <SettingRow
        icon={<EyeOff strokeWidth={1.8} />}
        title="Resume anonymization"
        description="Hides candidate identity on screen and from your AI provider. Features that need a name pause while it's on."
        control={
          <Switch
          checked={optimistic}
              onCheckedChange={toggle}
              disabled={disabled || pending}
              aria-label="Resume anonymization"
          />
        }
      />
  );
}

export function AiSettingsForm({ status }: { status: WorkspaceAiStatus }) {
  const router = useRouter();
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
  // Inline test-connection result so success reads clearly (not just a toast).
  const [testResult, setTestResult] = useState<
    | { state: "ok"; model: string }
    | { state: "error"; message: string }
    | null
  >(null);

  const info = getProvider(provider);

  const [customEndpoint, setCustomEndpoint] = useState(status.baseUrl ?? "");
  const [showCustomEndpoint, setShowCustomEndpoint] = useState(
    Boolean(status.baseUrl && status.baseUrl !== info?.baseUrl),
  );
  const isOpenRouter = info?.supportsModelSearch ?? false;
  const displayBaseUrl =
    showCustomEndpoint && customEndpoint
      ? customEndpoint
      : (info?.baseUrl ?? "");

  function changeProvider(next: string) {
    const id = next as AiProviderId;
    setProvider(id);
    const nextInfo = getProvider(id);
    setModelId(nextInfo?.models[0]?.id ?? "");
    setResults([]);
    setQuery("");
    setTestResult(null);
    if (!showCustomEndpoint) {
      setCustomEndpoint(nextInfo?.baseUrl ?? "");
    }
  }

  function runSearch() {
    startSearch(async () => {
      const found = await searchOpenRouterModelsAction(query);
      setResults(found);
      if (found.length === 0) {
        toast.message("No models found", {
          description: "Try a different term.",
        });
      }
    });
  }

  function runTest() {
    setTestResult(null);
    startTest(async () => {
      const result = await testAiConnectionAction({
        provider,
        modelId,
        apiKey: apiKey || undefined,
        baseUrl:
          showCustomEndpoint && customEndpoint ? customEndpoint : undefined,
      });
      if (result.ok) {
        setTestResult({ state: "ok", model: modelId });
        toast.success("Connection OK");
      } else {
        setTestResult({
          state: "error",
          message: result.error ?? "Connection failed.",
        });
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
        baseUrl:
          showCustomEndpoint && customEndpoint ? customEndpoint : undefined,
        enabled,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("AI settings saved");
      // Guide the user back to the AI settings overview instead of leaving
      // them on the same form (which reads as "nothing happened").
      router.push("/settings/ai" as Route);
      router.refresh();
    });
  }

  return (
    <DrawerLayout
      title="Configure AI"
      description="Your API key is encrypted at rest and never shown again."
      surface="page"
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
                      const Logo = PROVIDER_LOGO[provider];
                      return Logo ? <Logo className="size-4 shrink-0" /> : null;
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
                const Logo = PROVIDER_LOGO[option.id];
                return (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="flex items-center gap-2">
                      <Logo className="size-4 shrink-0" />
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
            onChange={(event) => {
              setModelId(event.target.value);
              setTestResult(null);
            }}
            placeholder={
              isOpenRouter
                ? "e.g. openai/gpt-4o"
                : "Choose or enter any model ID"
            }
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
                    <SpinnerIcon className="size-4" />
                  ) : (
                    <SearchIcon className="size-4" />
                  )}
                </Button>
              </div>
              {results.length > 0 ? (
                <div className="max-h-52 overflow-y-auto rounded-lg border">
                  {results.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        setModelId(model.id);
                        setTestResult(null);
                      }}
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
                  onClick={() => {
                    setModelId(model.id);
                    setTestResult(null);
                  }}
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
          {!isOpenRouter ? (
            <p className="text-xs text-muted-foreground">
              Choose a suggested model or enter any model ID supported by the
              provider.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-key">API key</Label>
          <Input
            id="ai-key"
            type="password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setTestResult(null);
            }}
            placeholder={
              status.hasApiKey
                ? "•••••••• (stored, leave blank to keep)"
                : "Paste your API key"
            }
            autoComplete="off"
          />
          {info ? (
            <p className="text-xs text-muted-foreground">
              {info.apiKeyHint}{" "}
              <a
                href={info.apiKeyUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline underline-offset-2 hover:text-pine"
              >
                Get a key
              </a>
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowCustomEndpoint(!showCustomEndpoint)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <GlobeIcon className="size-3.5" />
            {showCustomEndpoint
              ? "Use default endpoint"
              : "Custom API endpoint"}
          </button>
          {showCustomEndpoint ? (
            <Input
              value={customEndpoint}
              onChange={(event) => {
                setCustomEndpoint(event.target.value);
                setTestResult(null);
              }}
              placeholder={info?.baseUrl ?? "https://api.openai.com/v1"}
              className="font-mono text-sm"
            />
          ) : (
            <p className="rounded-lg bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
              {displayBaseUrl}
            </p>
          )}
        </div>

        <SettingRows className="rounded-[var(--radius-inner)] border border-hairline">
          <SettingRow
            title="Enable AI"
            htmlFor="ai-enabled"
            description="When off, Harly uses heuristics only."
            control={<Switch id="ai-enabled" checked={enabled} onCheckedChange={setEnabled} />}
          />
        </SettingRows>

        {/* Test connection + inline result. Success is a clear green banner,
            not just a transient toast. */}
        <div className="space-y-2.5">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={runTest}
            disabled={testing || !modelId.trim()}
          >
            {testing ? (
              <SpinnerIcon className="size-4" />
            ) : (
              <LightningIcon className="size-4" />
            )}
            Test connection
          </Button>
          {testResult?.state === "ok" ? (
            <div className="flex items-start gap-2 rounded-xl border border-pine/20 bg-sage/30 px-3 py-2.5 text-sm text-pine">
              <CheckIcon className="mt-0.5 size-4 shrink-0" />
              <p>
                <span className="font-medium">Connection healthy.</span>{" "}
                <span className="text-pine/80">
                  {providerLabel(provider)} responded with{" "}
                  <span className="font-mono text-[13px]">
                    {testResult.model}
                  </span>
                  .
                </span>
              </p>
            </div>
          ) : testResult?.state === "error" ? (
            <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2.5 text-sm text-clay">
              <GlobeIcon className="mt-0.5 size-4 shrink-0" />
              <p>
                <span className="font-medium">Couldn&apos;t connect.</span>{" "}
                {testResult.message}
              </p>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              Verify your key and model before saving.
            </p>
          )}
        </div>

        {/* Save is inline at the end — scroll to it, no floating bar. */}
        <div className="flex items-center justify-end gap-2 border-t border-hairline pt-5">
          <Button asChild variant="outline">
            <Link href={"/settings/ai" as Route}>Cancel</Link>
          </Button>
          <Button onClick={save} disabled={saving || !modelId.trim()}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save changes
          </Button>
        </div>
      </div>
    </DrawerLayout>
  );
}
