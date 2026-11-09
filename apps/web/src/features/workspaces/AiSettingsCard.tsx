"use client";

import { useEffect, useState, useTransition } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import {
  disableAiAction,
  saveAiSettingsAction,
  saveAiAutoScoreAction,
  saveAiDuplicateCheckAction,
  saveAiResumeAnonymizationAction,
  listProviderModelsAction,
  testAiConnectionAction,
} from "@/features/workspaces/ai-settings-actions";
import {
  AI_PROVIDERS,
  formatModelLabel,
  getProvider,
  isAiProviderId,
  type AiProviderId,
} from "@/lib/ai/providers";
import {
  buildModelOptions,
  describeModelSource,
  type ProviderModelsResult,
} from "@/lib/ai/model-options";
import { ProviderLogo } from "@/features/workspaces/provider-logos";
import { ModelCombobox, ToolCallingWarning } from "@/features/workspaces/ModelCombobox";
import { SecretInput } from "@/components/ui/secret-input";
import type { WorkspaceAiStatus } from "@/lib/ai/config";
import {
  BrandTile,
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyCheck, EyeOff, Gauge, RefreshCw, ScanText, Wand2 } from "lucide-react";
import {
  CheckIcon,
  GlobeIcon,
  KeyDuotoneIcon,
  LightningIcon,
  RobotDuotoneIcon,
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
  const t = useTranslations("features.workspaces.aiSettingsCard");
  const router = useRouter();
  const [togglePending, startToggle] = useTransition();

  function toggleEnabled(next: boolean) {
    if (!status.hasApiKey && next) {
      toast.error(t("configureFirst"));
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
        toast.error(result.error ?? t("updateFailed"));
        return;
      }
      toast.success(next ? t("enabledToast") : t("disabledToast"));
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
            title={t("title")}
            badge={
              status.hasApiKey ? (
                <StatusPill tone={status.enabled ? "on" : "off"}>
                  {status.enabled ? t("active") : t("paused")}
                </StatusPill>
              ) : (
                <StatusPill tone="neutral">{t("usingHeuristics")}</StatusPill>
              )
            }
            description={t("description")}
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
                        {status.hasApiKey ? t("manage") : t("configureAi")}
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="default" disabled>
                      <KeyDuotoneIcon className="size-4" />
                      {t("configureAi")}
                    </Button>
                  )}
                  {status.hasApiKey ? (
                    <label className="flex h-9 items-center gap-2 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 text-sm">
                      <Switch
                        checked={status.enabled}
                        disabled={togglePending}
                        onCheckedChange={toggleEnabled}
                        aria-label={t("enableAi")}
                      />
                      <span className="text-muted-foreground">
                        {status.enabled ? t("on") : t("off")}
                      </span>
                    </label>
                  ) : null}
                </>
              ) : null
            }
          />

          {status.hasApiKey ? (
            <div className="mt-4 grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <StatCell label={t("provider")}>
                {status.provider ? <ProviderLogo id={status.provider} className="size-4" /> : null}
                {providerLabel(status.provider)}
              </StatCell>
              <StatCell label={t("model")}>
                <span className="truncate font-mono text-[13px]">
                  {status.modelId
                    ? formatModelLabel(status.modelId)
                    : t("notConfigured")}
                </span>
              </StatCell>
              <StatCell label={t("endpoint")}>
                <span className="truncate text-muted-foreground">
                  {status.baseUrl ?? t("providerDefault")}
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
            {t("aiFeatures")}
          </h2>
        </div>
        <SettingRows>
          <FeatureRow
            icon={<ScanText strokeWidth={1.8} />}
            title={t("resumeParsing")}
            description={t("resumeParsingDescription")}
          />
          <FeatureRow
            icon={<Wand2 strokeWidth={1.8} />}
            title={t("jobDescriptionDrafting")}
            description={t("jobDescriptionDraftingDescription")}
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
            {t("worksWithProvider")}
          </h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {t("worksWithProviderDescription")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2.5 px-6 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {AI_PROVIDERS.map((provider) => {
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
                  <ProviderLogo id={provider.id} className="size-4" />
                </BrandTile>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {provider.label}
                  </span>
                  {isActive ? (
                    <span className="block text-[11px] font-medium text-pine">
                      {t("connected")}
                    </span>
                  ) : (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {provider.supportsModelSearch
                        ? t("hundredsOfModels")
                        : provider.requiresBaseUrl
                          ? t("yourEndpoint")
                          : provider.allowPrivateHosts
                            ? t("runsLocally")
                            : t("bringYourKey")}
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
  const t = useTranslations("features.workspaces.aiSettingsCard");
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
      <GlobeIcon className="mt-0.5 size-4 shrink-0" />
      <p>
        {t.rich("encryptionWarning", {
          code: (chunks) => <code className="font-mono text-xs">{chunks}</code>,
        })}
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
  const t = useTranslations("features.workspaces.aiSettingsCard");
  return (
    <SettingRow
      icon={icon}
      title={title}
      description={description}
      control={
        <span className="rounded-full bg-sage-wash px-2 py-0.5 text-[11.5px] font-medium text-sage-ink">
          {t("alwaysOn")}
        </span>
      }
    />
  );
}

/** Why a model-backed toggle is locked, in one quiet line. */
function LockedHint({ status }: { status: WorkspaceAiStatus }) {
  const t = useTranslations("features.workspaces.aiSettingsCard");
  if (!status.hasApiKey) {
    return <p className="text-[12.5px] text-soft-ink">{t("connectProviderToEnable")}</p>;
  }
  if (!status.enabled) {
    return <p className="text-[12.5px] text-warning-clay">{t("enableAiToEnable")}</p>;
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
  const t = useTranslations("features.workspaces.aiSettingsCard");
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
        toast.error(result.error ?? t("updateSettingFailed"));
        return;
      }
      toast.success(next ? t("autoScoreEnabled") : t("autoScoreDisabled"));
      router.refresh();
    });
  }

  return (
      <SettingRow
        icon={<Gauge strokeWidth={1.8} />}
        title={t("autoScore")}
        description={t("autoScoreDescription")}
        control={
          <Switch
          checked={optimistic}
              onCheckedChange={toggle}
              disabled={disabled || pending}
              aria-label={t("autoScore")}
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
  const t = useTranslations("features.workspaces.aiSettingsCard");
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
        toast.error(result.error ?? t("updateSettingFailed"));
        return;
      }
      toast.success(
        next ? t("duplicateDetectionEnabled") : t("duplicateDetectionDisabled"),
      );
      router.refresh();
    });
  }

  return (
      <SettingRow
        icon={<CopyCheck strokeWidth={1.8} />}
        title={t("duplicateDetection")}
        description={t("duplicateDetectionDescription")}
        control={
          <Switch
          checked={optimistic}
              onCheckedChange={toggle}
              disabled={disabled || pending}
              aria-label={t("duplicateDetection")}
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
  const t = useTranslations("features.workspaces.aiSettingsCard");
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
        toast.error(result.error ?? t("updateSettingFailed"));
        return;
      }
      toast.success(
        next ? t("resumeAnonymizationEnabled") : t("resumeAnonymizationDisabled"),
      );
      router.refresh();
    });
  }

  return (
      <SettingRow
        icon={<EyeOff strokeWidth={1.8} />}
        title={t("resumeAnonymization")}
        description={t("resumeAnonymizationDescription")}
        control={
          <Switch
          checked={optimistic}
              onCheckedChange={toggle}
              disabled={disabled || pending}
              aria-label={t("resumeAnonymization")}
          />
        }
      />
  );
}

export function AiSettingsForm({
  status,
  allowLocalLlm = false,
}: {
  status: WorkspaceAiStatus;
  /** Server has HARLY_ALLOW_LOCAL_LLM=1 (local / LAN model servers allowed). */
  allowLocalLlm?: boolean;
}) {
  const t = useTranslations("features.workspaces.aiSettingsCard");
  const tProviders = useTranslations("labels.ai.providers");
  const tModelSource = useTranslations("labels.ai.modelSource");
  const router = useRouter();
  const initialProvider: AiProviderId = isAiProviderId(status.provider ?? "")
    ? (status.provider as AiProviderId)
    : "openai";
  const [provider, setProvider] = useState<AiProviderId>(initialProvider);
  const [modelId, setModelId] = useState<string>(status.modelId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(status.enabled || !status.hasApiKey);

  const info = getProvider(provider);
  const [customEndpoint, setCustomEndpoint] = useState(
    status.provider === initialProvider ? (status.baseUrl ?? "") : "",
  );
  const [showCustomEndpoint, setShowCustomEndpoint] = useState(
    Boolean(
      info?.requiresBaseUrl || (status.provider === initialProvider && status.baseUrl),
    ),
  );

  const [catalog, setCatalog] = useState<ProviderModelsResult | null>(null);
  const [loadingModels, startLoadModels] = useTransition();
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const [testResult, setTestResult] = useState<
    | { state: "ok"; model: string }
    | { state: "error"; message: string }
    | null
  >(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const keyIsStoredForProvider = status.hasApiKey && status.provider === provider;
  const endpointValue =
    (info?.requiresBaseUrl || showCustomEndpoint) && customEndpoint.trim()
      ? customEndpoint.trim()
      : undefined;
  const models = catalog?.models ?? [];
  const selectedModel = models.find((model) => model.id === modelId);
  const endpointLooksLocal = endpointValue
    ? looksLocalOrPrivate(endpointValue)
    : Boolean(info?.allowPrivateHosts && info.baseUrl && looksLocalOrPrivate(info.baseUrl));

  function loadModels(target: AiProviderId, forceRefresh = false) {
    startLoadModels(async () => {
      try {
        const result = await listProviderModelsAction({ provider: target, forceRefresh });
        setCatalog(result);
      } catch {
        // Offline / server hiccup: the picker still accepts any typed ID.
        setCatalog({
          models: buildModelOptions(getProvider(target) ?? { models: [] }, []),
          source: "builtin",
          fetchedAt: null,
        });
      }
    });
  }

  // Load the provider's model list on mount and when the provider changes.
  useEffect(() => {
    loadModels(provider);
  }, [provider]);

  function changeProvider(next: string) {
    const id = next as AiProviderId;
    const nextInfo = getProvider(id);
    setProvider(id);
    setModelId(nextInfo?.models[0]?.id ?? "");
    setCatalog(null);
    setTestResult(null);
    setSaveError(null);
    setApiKey("");
    setCustomEndpoint("");
    setShowCustomEndpoint(Boolean(nextInfo?.requiresBaseUrl));
  }

  function runTest() {
    setTestResult(null);
    startTest(async () => {
      const result = await testAiConnectionAction({
        provider,
        modelId,
        apiKey: apiKey || undefined,
        baseUrl: endpointValue,
      });
      if (result.ok) {
        setTestResult({ state: "ok", model: modelId });
        toast.success(t("connectionOk"));
      } else {
        setTestResult({ state: "error", message: result.error ?? t("connectionFailed") });
      }
    });
  }

  function save() {
    setSaveError(null);
    startSave(async () => {
      const result = await saveAiSettingsAction({
        provider,
        modelId,
        apiKey: apiKey || undefined,
        baseUrl: endpointValue,
        enabled,
      });
      if (!result.ok) {
        setSaveError(result.error ?? t("saveFailed"));
        return;
      }
      toast.success(t("aiSettingsSaved"));
      router.push("/settings/ai" as Route);
      router.refresh();
    });
  }

  const showEndpointField = Boolean(info?.requiresBaseUrl || showCustomEndpoint);

  return (
    <DrawerLayout
      title={t("configureTitle")}
      description={t("configureDescription")}
      surface="page"
    >
      {/* autoComplete="off" + masked text inputs (no password field) keep
          browsers and password managers from filling a saved login in here. */}
      <form
        autoComplete="off"
        onSubmit={(event) => event.preventDefault()}
        className="space-y-5"
        data-form-type="other"
      >
        <div className="space-y-2">
          <Label htmlFor="ai-provider">{t("provider")}</Label>
          <Select value={provider} onValueChange={changeProvider}>
            <SelectTrigger id="ai-provider" className="w-full">
              <SelectValue>
                <span className="flex items-center gap-2">
                  <ProviderLogo id={provider} className="size-4 shrink-0" />
                  {info?.label ?? provider}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((option) => {
                return (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="flex items-center gap-2">
                      <ProviderLogo id={option.id} className="size-4 shrink-0" />
                      {option.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {info ? <p className="text-xs text-muted-foreground">{tProviders(`${info.id}.tagline`)}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-model">{provider === "azure" ? t("deploymentName") : t("model")}</Label>
          <ModelCombobox
            id="ai-model"
            value={modelId}
            onChange={(next) => {
              setModelId(next);
              setTestResult(null);
            }}
            models={models}
            loading={loadingModels}
            placeholder={
              info?.modelExample ? t("modelPlaceholder", { example: info.modelExample }) : t("chooseModel")
            }
          />
          <ToolCallingWarning model={selectedModel} />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {catalog ? describeModelSource(catalog.source, catalog.fetchedAt, tModelSource) : t("loadingModels")}
              {" · "}
              {t("anyModelId")}
            </span>
            {info?.catalogId ? (
              <button
                type="button"
                onClick={() => loadModels(provider, true)}
                disabled={loadingModels}
                className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:text-pine disabled:opacity-50"
              >
                <RefreshCw className={cn("size-3", loadingModels && "animate-spin")} aria-hidden />
                {t("refresh")}
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-key">
            {t("apiKey")}
            {!info?.requiresKey ? (
              <span className="ml-1 font-normal text-muted-foreground">{t("optional")}</span>
            ) : null}
          </Label>
          <SecretInput
            id="ai-key"
            name="ai_provider_secret"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setTestResult(null);
            }}
            placeholder={
              keyIsStoredForProvider
                ? t("keyStored")
                : info?.requiresKey
                  ? t("pasteKey")
                  : t("keyNotNeeded")
            }
          />
          {info ? (
            <p className="text-xs text-muted-foreground">
              {tProviders(`${info.id}.apiKeyHint`)}{" "}
              {info.requiresKey ? (
                <a
                  href={info.apiKeyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline underline-offset-2 hover:text-pine"
                >
                  {t("getKey")}
                </a>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          {!info?.requiresBaseUrl ? (
            <button
              type="button"
              onClick={() => {
                setShowCustomEndpoint(!showCustomEndpoint);
                setTestResult(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              <GlobeIcon className="size-3.5" />
              {showCustomEndpoint ? t("useDefaultEndpoint") : t("customApiEndpoint")}
            </button>
          ) : null}
          {showEndpointField ? (
            <div className="space-y-2">
              <Label htmlFor="ai-base-url">
                {info?.requiresBaseUrl ? t("apiEndpoint") : t("customApiEndpoint")}
              </Label>
              <Input
                id="ai-base-url"
                name="ai_base_url"
                type="url"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={customEndpoint}
                onChange={(event) => {
                  setCustomEndpoint(event.target.value);
                  setTestResult(null);
                  setSaveError(null);
                }}
                placeholder={info?.baseUrl || "https://llm.example.com/v1"}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{info ? tProviders(`${info.id}.baseUrlHelp`) : null}</p>
              <EndpointGuidance
                info={info}
                allowLocalLlm={allowLocalLlm}
                looksLocal={endpointLooksLocal}
              />
            </div>
          ) : (
            <div className="space-y-1">
              <p className="rounded-lg bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
                {info?.baseUrl}
              </p>
              {info?.allowPrivateHosts && endpointLooksLocal ? (
                <EndpointGuidance
                  info={info}
                  allowLocalLlm={allowLocalLlm}
                  looksLocal={endpointLooksLocal}
                />
              ) : null}
            </div>
          )}
        </div>

        <SettingRows className="rounded-[var(--radius-inner)] border border-hairline">
          <SettingRow
            title={t("enableAi")}
            htmlFor="ai-enabled"
            description={t("enableAiHint")}
            control={<Switch id="ai-enabled" checked={enabled} onCheckedChange={setEnabled} />}
          />
        </SettingRows>

        <div className="space-y-2.5">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={runTest}
            disabled={testing || !modelId.trim()}
          >
            {testing ? <SpinnerIcon className="size-4" /> : <LightningIcon className="size-4" />}
            {t("testConnection")}
          </Button>
          {testResult?.state === "ok" ? (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl border border-pine/20 bg-sage/30 px-3 py-2.5 text-sm text-pine"
            >
              <CheckIcon className="mt-0.5 size-4 shrink-0" />
              <p>
                <span className="font-medium">{t("connectionHealthy")}</span>{" "}
                <span className="text-pine/80">
                  {t.rich("respondedWith", {
                    provider: providerLabel(provider) ?? provider,
                    model: testResult.model,
                    throughEndpoint: endpointValue ? "yes" : "no",
                    mono: (chunks) => <span className="font-mono text-[13px]">{chunks}</span>,
                  })}
                </span>
              </p>
            </div>
          ) : testResult?.state === "error" ? (
            <ErrorBanner title={t("couldntConnect")}>{testResult.message}</ErrorBanner>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              {t("verifyBeforeSaving")}
            </p>
          )}
          {saveError ? <ErrorBanner title={t("couldntSave")}>{saveError}</ErrorBanner> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline pt-5">
          <Button asChild variant="outline">
            <Link href={"/settings/ai" as Route}>{t("cancel")}</Link>
          </Button>
          <Button type="button" onClick={save} disabled={saving || !modelId.trim()}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            {t("saveChanges")}
          </Button>
        </div>
      </form>
    </DrawerLayout>
  );
}

function ErrorBanner({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2.5 text-sm text-clay"
    >
      <GlobeIcon className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 break-words">
        <span className="font-medium">{title}</span> {children}
      </p>
    </div>
  );
}

/** Best-effort client hint; the server check in assertSafeAiBaseUrl is authoritative. */
function looksLocalOrPrivate(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "[::1]" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

function EndpointGuidance({
  info,
  allowLocalLlm,
  looksLocal,
}: {
  info: ReturnType<typeof getProvider>;
  allowLocalLlm: boolean;
  looksLocal: boolean;
}) {
  const t = useTranslations("features.workspaces.aiSettingsCard");
  if (!info) return null;
  if (looksLocal) {
    return allowLocalLlm ? (
      <p className="text-xs text-pine">
        {t.rich("endpointLocalEnabled", {
          code: (chunks) => <code className="font-mono">{chunks}</code>,
        })}
      </p>
    ) : (
      <div className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-xs text-clay">
        {t.rich("endpointLocalDisabled", {
          code: (chunks) => <code className="font-mono">{chunks}</code>,
        })}
      </div>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      {info.allowPrivateHosts
        ? t("endpointProxyOnly")
        : t("endpointProviderProxy", { provider: info.label })}
    </p>
  );
}
