"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  RotateCcw,
  Loader2,
  Check,
  Minus,
  FileCode,
  Info,
  Clock,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import type { Trigger } from "../schema";
import type { DryRunScenario, DryRunStep } from "../builder-data";
import type { WorkflowGraphV2 } from "../definition/schema-v2";
import { outputPorts } from "../definition/ports";
import { BuilderSelect } from "./inspector/BuilderSelect";
import { builderFieldClass } from "./field-styles";
import type { JsonValue } from "../definition/schema-v2";
import {
  defaultSimulationFixture,
  type SimulationPreset,
} from "../runtime/simulation-fixtures";
import type { NodeOutcome } from "../runtime/advance";
import { parseWebhookSimulationPayload } from "../webhook-simulation";
import { actionMeta, triggerMeta, type BuilderT } from "./catalog";
import { ScopedSearchSelect } from "./inspector/ScopedSearchSelect";

/**
 * The Test tab's panel: runs a dry-run against a sample candidate via
 * `dryRunWorkflowAction`. Shows the step-by-step resolution path
 * with business-level context, keeping low-level JSON/fixtures in advanced settings.
 */
export function DryRunPanel({
  trigger,
  graph,
  candidates,
  workflowId,
  webhookEndpoints,
  preview,
  run,
  onScenarioChange,
}: {
  trigger: Trigger;
  graph: WorkflowGraphV2;
  workflowId?: string;
  webhookEndpoints: Array<{
    id: string;
    name: string;
    enabled: boolean;
    payloadSchema: Record<string, unknown>;
  }>;
  candidates: Array<{ id: string; name: string; email: string }>;
  preview: (input: { trigger: Trigger; candidateId?: string }) => Promise<{
    ok: boolean;
    error?: string;
    payload?: Record<string, unknown>;
  }>;
  run: (input: {
    graph: WorkflowGraphV2;
    workflowId?: string;
    candidateId?: string;
    webhookPayload?: Record<string, unknown>;
    scenario?: DryRunScenario;
    fixtures?: Record<string, NodeOutcome>;
    startedAt?: string;
  }) => Promise<{
    ok: boolean;
    error?: string;
    matched?: boolean;
    triggerMatched?: boolean;
    terminal?: string;
    steps?: DryRunStep[];
  }>;
  onScenarioChange?: (scenario: DryRunScenario) => void;
}) {
  const [pending, startRun] = useTransition();
  const t = useTranslations("features.automations.dryRunPanel");
  const tl = useTranslations("labels.automations");
  const locale = useLocale();
  const [candidateId, setCandidateId] = useState(candidates[0]?.id ?? "");
  const [webhookPayloadText, setWebhookPayloadText] = useState("{}\n");
  const [webhookPayloadError, setWebhookPayloadError] = useState<string | null>(
    null,
  );
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [scenario, setScenario] = useState<DryRunScenario>("success");
  const [startedAt, setStartedAt] = useState("2026-01-05T09:00");
  const [lastRunFingerprint, setLastRunFingerprint] = useState<string | null>(
    null,
  );

  const graphFingerprint = useMemo(
    () =>
      JSON.stringify({
        nodes: graph.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          name: n.name,
          config: (n as Record<string, unknown>).config,
          tree: (n as Record<string, unknown>).tree,
        })),
        edges: graph.edges,
      }),
    [graph],
  );

  const fixtureNodes = useMemo(
    () =>
      graph.nodes.filter(
        (node) =>
          node.type === "action" ||
          node.type === "delay" ||
          node.type === "approval" ||
          node.type === "wait",
      ),
    [graph.nodes],
  );

  const [fixtureOverrides, setFixtureOverrides] = useState<
    Record<string, FixtureDraft | null>
  >({});

  const fixtures = useMemo(
    () =>
      Object.fromEntries(
        fixtureNodes.map((node) => [
          node.id,
          Object.hasOwn(fixtureOverrides, node.id)
            ? fixtureOverrides[node.id]
            : toFixtureDraft(node, scenario),
        ]),
      ),
    [fixtureNodes, fixtureOverrides, scenario],
  );

  const [fixtureError, setFixtureError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    matched: boolean;
    triggerMatched: boolean;
    terminal: string;
    steps: DryRunStep[];
    error?: string;
  } | null>(null);

  const webhookTrigger = trigger.event === "webhook.received";
  const selectedEndpointId =
    typeof trigger.filter?.endpointId === "string"
      ? trigger.filter.endpointId
      : "";
  const selectedEndpoint = webhookEndpoints.find(
    (endpoint) => endpoint.id === selectedEndpointId,
  );

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === candidateId) ??
    candidates[0];

  const isGraphOutdated = Boolean(
    result && lastRunFingerprint && lastRunFingerprint !== graphFingerprint,
  );

  function handleRun() {
    let webhookPayload: Record<string, unknown> | undefined;
    if (webhookTrigger) {
      const parsedPayload = parseWebhookSimulationPayload(webhookPayloadText);
      if (!parsedPayload.valid) {
        setWebhookPayloadError(parsedPayload.error);
        setResult(null);
        return;
      }
      if (!selectedEndpoint) {
        setWebhookPayloadError(
          t("chooseEndpointTest"),
        );
        setResult(null);
        return;
      }
      webhookPayload = parsedPayload.payload;
    }
    const parsed = parseFixtureDrafts(t, tl, fixtureNodes, fixtures);
    if (parsed.error) {
      setFixtureError(parsed.error);
      setResult(null);
      return;
    }
    const virtualStart = new Date(startedAt);
    if (!startedAt || !Number.isFinite(virtualStart.getTime())) {
      setFixtureError(t("invalidStart"));
      setResult(null);
      return;
    }
    setWebhookPayloadError(null);
    setFixtureError(null);
    startRun(async () => {
      setLastRunFingerprint(graphFingerprint);
      const r = await run({
        graph,
        workflowId,
        candidateId: candidateId || undefined,
        webhookPayload,
        scenario,
        fixtures: parsed.fixtures,
        startedAt: virtualStart.toISOString(),
      });
      if (r.ok) {
        setResult({
          matched: Boolean(r.matched),
          triggerMatched: Boolean(r.triggerMatched),
          terminal: r.terminal ?? "invalid",
          steps: r.steps ?? [],
          error: r.error,
        });
      } else {
        setResult({
          matched: false,
          triggerMatched: false,
          terminal: "invalid",
          steps: [],
          error: r.error ?? t("runFailed"),
        });
      }
    });
  }

  function applyPreset(nextScenario: SimulationPreset) {
    setScenario(nextScenario);
    onScenarioChange?.(nextScenario);
    setFixtureError(null);
    setFixtureOverrides(
      Object.fromEntries(
        fixtureNodes.map((node) => [
          node.id,
          toFixtureDraft(node, nextScenario),
        ]),
      ),
    );
  }

  function handlePreview() {
    if (webhookTrigger) {
      const parsedPayload = parseWebhookSimulationPayload(webhookPayloadText);
      if (!parsedPayload.valid) {
        setWebhookPayloadError(parsedPayload.error);
        setPayload(null);
        return;
      }
      if (!selectedEndpoint) {
        setWebhookPayloadError(
          t("chooseEndpointPreview"),
        );
        setPayload(null);
        return;
      }
      setWebhookPayloadError(null);
      setPayload({
        eventId: "dry-run-event",
        endpointId: selectedEndpoint.id,
        externalEventId: "dry-run-event",
        payload: parsedPayload.payload,
      });
      return;
    }
    startRun(async () => {
      const r = await preview({
        trigger,
        candidateId: candidateId || undefined,
      });
      setPayload(
        r.ok
          ? (r.payload ?? null)
          : { error: r.error ?? t("previewFailed") },
      );
    });
  }

  return (
    <div className="space-y-4">
      {/* Test Setup Card */}
      <div className="rounded-2xl border border-border bg-pure-snow p-5 shadow-sm">
        <div className="space-y-1.5 text-sm">
          <p className="text-soft-ink">
            <span className="font-semibold text-foreground">{t("triggerLabel")}</span>{" "}
            {trigger.filter && Object.keys(trigger.filter).length > 0
              ? t("triggerWithFilters", { label: triggerMeta(trigger.event, tl).label })
              : triggerMeta(trigger.event, tl).label}
          </p>
          <p className="text-soft-ink">
            <span className="font-semibold text-foreground">{t("simulationLabel")}</span>{" "}
            {t("simulationDescription")}
          </p>
          {selectedCandidate ? (
            <p className="text-xs text-soft-ink">
              <span className="font-medium text-foreground">
                {t("testingCandidate")}
              </span>{" "}
              {selectedCandidate.name}{" "}
              <span className="text-soft-ink/80">({selectedCandidate.email})</span>
            </p>
          ) : (
            <p className="text-xs text-soft-ink">
              <span className="font-medium text-foreground">
                {t("sampleCandidate")}
              </span>{" "}
              {t("syntheticSample")}
            </p>
          )}
        </div>

        {/* Action Controls Bar */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <label
              htmlFor="dry-run-candidate-select"
              className="text-xs font-medium text-soft-ink shrink-0"
            >
              {t("testCandidate")}
            </label>
            <div className="min-w-56">
              <ScopedSearchSelect
                kind="candidates"
                value={candidateId}
                placeholder={t("mostRecentlyUpdated")}
                emptyLabel={t("mostRecentlyUpdated")}
                initialItems={candidates.map((candidate) => ({
                  id: candidate.id,
                  label: candidate.name,
                  hint: candidate.email,
                }))}
                onChange={(id) => setCandidateId(id)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-soft-ink shrink-0">
              {t("scenario")}
            </label>
            <BuilderSelect
              value={scenario}
              onChange={(event) =>
                applyPreset(event.target.value as DryRunScenario)
              }
              disabled={pending}
              className="rounded-lg border border-border bg-warm-paper px-2.5 py-1.5 text-xs text-foreground outline-none transition-colors duration-150 ease-out focus:border-foreground/40"
            >
              <option value="success">{t("scenarioSuccess")}</option>
              <option value="action_failure">{t("scenarioActionFailure")}</option>
              <option value="uncertain_wait">{t("scenarioUncertainWait")}</option>
            </BuilderSelect>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreview}
              disabled={pending || (webhookTrigger && !selectedEndpoint)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-soft-kraft transition-colors duration-150 disabled:opacity-50"
            >
              <FileCode className="size-3.5 text-soft-ink" />
              {webhookTrigger ? t("previewWebhook") : t("previewPayload")}
            </button>

            <button
              type="button"
              onClick={handleRun}
              disabled={pending || (webhookTrigger && !selectedEndpoint)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold shadow-sm transition-all duration-150 ease-out",
                pending
                  ? "bg-soft-kraft text-soft-ink"
                  : "bg-near-ink text-primary-foreground hover:bg-near-ink/90 active:scale-[0.98]",
              )}
            >
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("simulating")}
                </>
              ) : (
                <>
                  <Play className="size-3.5 fill-current" />
                  {t("simulateWorkflow")}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Webhook Configuration Section if Webhook Trigger */}
        {webhookTrigger ? (
          <section className="mt-4 rounded-xl border border-border bg-soft-kraft/20 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t("webhookBodyTitle")}
                </h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-soft-ink">
                  {t("webhookBodyDescription")}
                </p>
              </div>
              {selectedEndpoint ? (
                <span className="rounded-full border border-border bg-warm-paper px-2.5 py-1 text-xs text-soft-ink">
                  {t(selectedEndpoint.enabled ? "endpointActive" : "endpointDisabled", {
                    name: selectedEndpoint.name,
                  })}
                </span>
              ) : null}
            </div>
            {!selectedEndpoint ? (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-soft-ink"
              >
                {t("chooseEndpointAlert")}
              </p>
            ) : null}
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-foreground">
                {t("payloadJson")}
              </span>
              <textarea
                aria-label={t("webhookBodyAria")}
                aria-describedby="webhook-payload-help"
                value={webhookPayloadText}
                onChange={(event) => {
                  setWebhookPayloadText(event.target.value);
                  setWebhookPayloadError(null);
                  setPayload(null);
                }}
                disabled={pending}
                rows={6}
                spellCheck={false}
                className="w-full resize-y rounded-lg border border-border bg-warm-paper px-3 py-2 font-mono text-xs leading-relaxed text-foreground outline-none transition-colors duration-150 ease-out focus:border-foreground/40 disabled:opacity-60"
              />
            </label>
            <p
              id="webhook-payload-help"
              className="mt-1 text-[11px] text-soft-ink"
            >
              {t("payloadHelp")}
            </p>
            {webhookPayloadError ? (
              <p
                role="alert"
                className="mt-2 rounded-lg border border-danger-rust/30 bg-danger-rust/5 px-3 py-2 text-xs text-danger-rust"
              >
                {webhookPayloadError}
              </p>
            ) : null}
            {selectedEndpoint ? (
              <details className="mt-3 rounded-lg border border-border bg-warm-paper/70 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-foreground">
                  {t("viewSchema")}
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto text-[11px] leading-relaxed text-soft-ink">
                  {JSON.stringify(selectedEndpoint.payloadSchema, null, 2)}
                </pre>
              </details>
            ) : null}
          </section>
        ) : null}
      </div>

      {/* Outdated Revision Alert */}
      {isGraphOutdated ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-xs text-soft-ink"
        >
          <Info className="size-4 shrink-0 text-warning" />
          <span>
            {t("outdated")}
          </span>
        </div>
      ) : null}

      {/* Immediate Simulation Results Section */}
      {result && (
        <section
          role="status"
          aria-label={t("resultsTitle")}
          className="rounded-2xl border border-border bg-pure-snow p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {t("resultsTitle")}
            </h3>
            <span className="text-xs text-soft-ink">
              {t("stepsEvaluated", { count: result.steps.length })}
            </span>
          </div>

          {result.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-danger-rust/30 bg-danger-rust/5 p-3.5 text-xs text-danger-rust"
            >
              <XCircle className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{t("errorTitle")}</p>
                <p className="mt-0.5">{result.error}</p>
              </div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border p-3.5 text-xs font-medium transition-colors",
                  result.triggerMatched &&
                    result.terminal !== "failed" &&
                    result.terminal !== "uncertain"
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-soft-ink/30 bg-soft-kraft/40 text-soft-ink",
                )}
              >
                {result.triggerMatched &&
                ["succeeded", "completed_with_warnings", "stopped"].includes(
                  result.terminal,
                ) ? (
                  <CheckCircle2 className="size-4 shrink-0" />
                ) : (
                  <XCircle className="size-4 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-semibold">
                    {result.triggerMatched
                      ? t("finished", { terminal: terminalLabel(t, result.terminal) })
                      : t("triggerNotMatched")}
                  </p>
                  <p className="mt-0.5 text-[11px] opacity-90">
                    {result.triggerMatched
                      ? t("completedDescription")
                      : t("notMatchedDescription")}
                  </p>
                </div>
              </div>

              {result.steps.length > 0 && (
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-soft-kraft/10">
                  {result.steps.map((step, idx) => (
                    <div
                      key={step.nodeId || idx}
                      className="flex items-start gap-3 p-3 text-xs transition-colors hover:bg-soft-kraft/20"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                          step.status === "skipped"
                            ? "bg-soft-kraft text-quiet-mist"
                            : step.status === "failed" ||
                                step.status === "uncertain"
                              ? "bg-danger-rust/15 text-danger-rust"
                              : step.status === "needs_fixture"
                                ? "bg-warning/20 text-warning"
                                : "bg-success/20 text-success",
                        )}
                      >
                        {step.status === "skipped" ? (
                          <Minus className="size-3" />
                        ) : step.status === "failed" ||
                          step.status === "uncertain" ? (
                          <AlertCircle className="size-3" />
                        ) : (
                          <Check className="size-3" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-foreground">
                            {step.title}
                          </p>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                              step.status === "simulated" || step.status === "matched"
                                ? "bg-success/15 text-success"
                                : step.status === "skipped"
                                  ? "bg-soft-kraft text-soft-ink"
                                  : "bg-danger-rust/10 text-danger-rust",
                            )}
                          >
                            {stepStatusLabel(t, step.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-soft-ink leading-relaxed">
                          {step.detail}
                        </p>
                        {step.virtualTime && (
                          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-quiet-mist">
                            <Clock className="size-3" />
                            <span>
                              {t("virtualTime", {
                                time: new Date(step.virtualTime).toLocaleString(locale),
                              })}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Raw Payload Preview Output if triggered */}
      {payload && (
        <div className="rounded-2xl border border-border bg-pure-snow p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground">
              {t("evaluatedPayload")}
            </h4>
            <button
              type="button"
              onClick={() => setPayload(null)}
              className="text-xs text-soft-ink hover:text-foreground"
            >
              {t("dismiss")}
            </button>
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-warm-paper p-3 text-[11px] font-mono leading-relaxed text-soft-ink">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      )}

      {/* Advanced Test Settings (Collapsible) */}
      <details className="group rounded-2xl border border-border bg-soft-kraft/20 p-4 transition-all">
        <summary className="flex cursor-pointer select-none items-center justify-between text-xs font-semibold text-soft-ink hover:text-foreground">
          <div className="flex items-center gap-2">
            <span>{t("advancedSettings")}</span>
            <span className="rounded-full border border-border bg-warm-paper px-2 py-0.5 text-[10px] font-normal text-soft-ink">
              {t("advancedSettingsBadge")}
            </span>
          </div>
          <span className="text-[11px] text-soft-ink group-open:rotate-180 transition-transform duration-150">
            ▾
          </span>
        </summary>

        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {/* Virtual Start Control */}
          <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-soft-ink">
            {t("virtualStart")}
            <input
              type="datetime-local"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
              disabled={pending}
              className={builderFieldClass({
                compact: true,
                surface: "warm-paper",
              })}
            />
            <span className="font-normal text-quiet-mist">
              {t("virtualStartHelp")}
            </span>
          </label>

          {/* Step Outcomes & Fixture Responses */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t("stepOutcomes")}
                </h3>
                <p className="mt-0.5 text-xs text-soft-ink">
                  {t("stepOutcomesDescription")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => applyPreset("success")}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-warm-paper px-2.5 py-1 text-xs font-medium text-soft-ink hover:bg-soft-kraft disabled:opacity-50"
              >
                <RotateCcw className="size-3" />
                {t("resetFixtures")}
              </button>
            </div>

            <div className="space-y-2">
              {fixtureNodes.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-soft-ink">
                  {t("noFixtureNodes")}
                </p>
              ) : (
                fixtureNodes.map((node) => (
                  <FixtureEditor
                    key={node.id}
                    node={node}
                    value={fixtures[node.id] ?? null}
                    disabled={pending}
                    onChange={(value) => {
                      setFixtureError(null);
                      setFixtureOverrides((current) => ({
                        ...current,
                        [node.id]: value,
                      }));
                    }}
                  />
                ))
              )}
            </div>

            {fixtureError && (
              <p
                role="alert"
                className="rounded-lg border border-danger-rust/30 bg-danger-rust/5 px-3 py-2 text-xs text-danger-rust"
              >
                {fixtureError}
              </p>
            )}
          </section>
        </div>
      </details>
    </div>
  );
}

type Translator = ReturnType<typeof useTranslations>;

function stepStatusLabel(t: Translator, status: DryRunStep["status"]): string {
  switch (status) {
    case "simulated":
    case "matched":
      return t("stepStatus.simulated");
    case "failed":
      return t("stepStatus.failed");
    case "uncertain":
      return t("stepStatus.uncertain");
    case "skipped":
      return t("stepStatus.skipped");
    case "needs_fixture":
      return t("stepStatus.needsFixture");
  }
}

type FixtureDraft = {
  status: NodeOutcome["status"];
  outputText: string;
  port: string;
  code: string;
  retryable: boolean;
  providerRef: string;
};

function toFixtureDraft(
  node: WorkflowGraphV2["nodes"][number],
  preset: SimulationPreset,
): FixtureDraft {
  const outcome = defaultSimulationFixture(node, preset);
  return {
    status: outcome.status,
    outputText:
      outcome.status === "succeeded"
        ? JSON.stringify(outcome.output, null, 2)
        : '{\n  "simulated": true\n}',
    port: outcome.status === "succeeded" ? (outcome.port ?? "") : "",
    code: outcome.status === "succeeded" ? "SIMULATED_FAILURE" : outcome.code,
    retryable: outcome.status === "failed" ? Boolean(outcome.retryable) : false,
    providerRef:
      outcome.status === "succeeded" || outcome.status === "failed"
        ? (outcome.providerRef ?? "")
        : "",
  };
}

const KNOWN_TERMINALS = [
  "succeeded",
  "completedWithWarnings",
  "stopped",
  "failed",
  "uncertain",
  "cancelled",
  "needsFixture",
  "invalid",
] as const;

function terminalLabel(t: Translator, terminal: string): string {
  const key = terminal.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  return (KNOWN_TERMINALS as readonly string[]).includes(key)
    ? t(`terminal.${key}`)
    : terminal.replaceAll("_", " ");
}

function fixtureLabel(
  t: Translator,
  tl: BuilderT,
  node: WorkflowGraphV2["nodes"][number],
): string {
  if (node.name?.trim()) return node.name.trim();
  if (node.type === "action")
    return actionMeta(node.actionType, tl)?.label ?? node.actionType.replaceAll("_", " ");
  if (node.type === "wait")
    return node.kind === "document_package"
      ? t("documentPackage")
      : t("eventWait");
  if (node.type === "approval") return t("approval");
  return t("wait");
}

function parseFixtureDrafts(
  t: Translator,
  tl: BuilderT,
  nodes: WorkflowGraphV2["nodes"],
  drafts: Record<string, FixtureDraft | null>,
): { fixtures?: Record<string, NodeOutcome>; error?: string } {
  const result: Record<string, NodeOutcome> = {};
  for (const node of nodes) {
    const draft = drafts[node.id];
    if (!draft) continue;
    if (draft.status === "succeeded") {
      try {
        const output = JSON.parse(draft.outputText) as JsonValue;
        result[node.id] = {
          status: "succeeded",
          output,
          ...(draft.port ? { port: draft.port } : {}),
          ...(draft.providerRef.trim()
            ? { providerRef: draft.providerRef.trim() }
            : {}),
        };
      } catch {
        return {
          error: t("resultPayloadInvalid", { label: fixtureLabel(t, tl, node) }),
        };
      }
    } else if (draft.status === "failed") {
      if (!draft.code.trim())
        return { error: t("errorCodeMissing", { label: fixtureLabel(t, tl, node) }) };
      result[node.id] = {
        status: "failed",
        code: draft.code.trim(),
        retryable: draft.retryable,
        ...(draft.providerRef.trim()
          ? { providerRef: draft.providerRef.trim() }
          : {}),
      };
    } else {
      if (!draft.code.trim())
        return {
          error: t("uncertaintyCodeMissing", { label: fixtureLabel(t, tl, node) }),
        };
      result[node.id] = { status: "uncertain", code: draft.code.trim() };
    }
  }
  return { fixtures: result };
}

function FixtureEditor({
  node,
  value,
  disabled,
  onChange,
}: {
  node: WorkflowGraphV2["nodes"][number];
  value: FixtureDraft | null;
  disabled: boolean;
  onChange: (value: FixtureDraft | null) => void;
}) {
  const t = useTranslations("features.automations.dryRunPanel");
  const tl = useTranslations("labels.automations");
  const ports = outputPorts(node);
  const update = (patch: Partial<FixtureDraft>) =>
    onChange(value ? { ...value, ...patch } : toFixtureDraft(node, "success"));
  return (
    <div className="rounded-lg border border-border bg-pure-snow px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold capitalize text-foreground">
            {fixtureLabel(t, tl, node)}
          </p>
          <p className="mt-0.5 text-[11px] text-soft-ink">
            {t("simulatedResponse")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BuilderSelect
            value={value?.status ?? "missing"}
            onChange={(event) => {
              const status = event.target.value as
                | FixtureDraft["status"]
                | "missing";
              onChange(
                status === "missing"
                  ? null
                  : { ...(value ?? toFixtureDraft(node, "success")), status },
              );
            }}
            disabled={disabled}
            className={builderFieldClass({
              compact: true,
              surface: "warm-paper",
            })}
            aria-label={t("syntheticOutcome", { label: fixtureLabel(t, tl, node) })}
          >
            <option value="succeeded">{t("optionSucceeds")}</option>
            <option value="failed">{t("optionFails")}</option>
            <option value="uncertain">{t("optionUncertain")}</option>
            <option value="missing">{t("optionMissing")}</option>
          </BuilderSelect>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled || !value}
            className="text-[11px] font-medium text-soft-ink hover:text-danger-rust disabled:opacity-40"
          >
            {t("clear")}
          </button>
        </div>
      </div>
      {value?.status === "succeeded" ? (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-soft-ink">
              {t("resultPayload")}
            </span>
            <textarea
              value={value.outputText}
              onChange={(event) => update({ outputText: event.target.value })}
              disabled={disabled}
              rows={3}
              className="min-h-20 w-full resize-y rounded-lg border border-border bg-warm-paper px-2.5 py-2 font-mono text-[11px] text-foreground outline-none transition-colors duration-150 ease-out focus:border-foreground/40"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-soft-ink">
              {t("continueThrough")}
            </span>
            <BuilderSelect
              value={value.port}
              onChange={(event) => update({ port: event.target.value })}
              disabled={disabled}
              className={builderFieldClass({ surface: "warm-paper" })}
            >
              <option value="">{t("defaultSuccessPort")}</option>
              {ports.map((port) => (
                <option key={port} value={port}>
                  {port}
                </option>
              ))}
            </BuilderSelect>
          </label>
        </div>
      ) : value ? (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-soft-ink">
              {value.status === "failed" ? t("errorCode") : t("uncertaintyCode")}
            </span>
            <input
              value={value.code}
              onChange={(event) => update({ code: event.target.value })}
              disabled={disabled}
              className={builderFieldClass({ surface: "warm-paper" })}
            />
          </label>
          {value.status === "failed" ? (
            <label className="flex items-end gap-2 pb-2 text-[11px] text-soft-ink">
              <input
                type="checkbox"
                checked={value.retryable}
                onChange={(event) =>
                  update({ retryable: event.target.checked })
                }
                disabled={disabled}
              />
              {t("retryable")}
            </label>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-warning">
          {t("missingFixture")}
        </p>
      )}
      {value && value.status !== "uncertain" && (
        <label className="mt-2 block">
          <span className="mb-1 block text-[11px] font-medium text-soft-ink">
            {t("providerReference")} <span className="font-normal">{t("optional")}</span>
          </span>
          <input
            value={value.providerRef}
            onChange={(event) => update({ providerRef: event.target.value })}
            disabled={disabled}
            placeholder={t("providerReferencePlaceholder")}
            className={builderFieldClass({
              compact: true,
              surface: "warm-paper",
            })}
          />
        </label>
      )}
    </div>
  );
}
