/**
 * Client-safe shaping of model lists for the settings combobox. The server
 * action turns a models.dev catalog (or the built-in suggestions) into these.
 */
import type { AiProviderInfo } from "./providers";

export type ModelOption = {
  id: string;
  name: string;
  contextWindow?: number;
  toolCall?: boolean;
  reasoning?: boolean;
  attachments?: boolean;
  inputCostPerM?: number;
  outputCostPerM?: number;
  deprecated?: boolean;
  /** False for entries from Harly's own curated list (no capability data). */
  fromCatalog: boolean;
};

export type ModelListSource = "live" | "cache" | "snapshot" | "builtin";

export type ProviderModelsResult = {
  models: ModelOption[];
  source: ModelListSource;
  fetchedAt: string | null;
};

type CatalogLike = {
  id: string;
  name: string;
  contextWindow?: number;
  toolCall?: boolean;
  reasoning?: boolean;
  attachments?: boolean;
  inputCostPerM?: number;
  outputCostPerM?: number;
  deprecated?: boolean;
};

/** Catalog models first (as given), then curated ones the catalog lacks. */
export function buildModelOptions(
  info: Pick<AiProviderInfo, "models">,
  catalogModels: CatalogLike[],
): ModelOption[] {
  const seen = new Set<string>();
  const out: ModelOption[] = [];
  for (const model of catalogModels) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    out.push({
      id: model.id,
      name: model.name || model.id,
      contextWindow: model.contextWindow,
      toolCall: model.toolCall,
      reasoning: model.reasoning,
      attachments: model.attachments,
      inputCostPerM: model.inputCostPerM,
      outputCostPerM: model.outputCostPerM,
      deprecated: model.deprecated,
      fromCatalog: true,
    });
  }
  for (const model of info.models) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    out.push({ id: model.id, name: model.label, fromCatalog: false });
  }
  return out;
}

/** True only when the catalog says the model cannot call tools. */
export function lacksToolCalling(
  option: Pick<ModelOption, "toolCall" | "fromCatalog"> | undefined,
): boolean {
  return Boolean(option && option.fromCatalog && option.toolCall === false);
}

export function formatContextWindow(tokens: number | undefined): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${+(tokens / 1_000_000).toFixed(1)}M ctx`;
  return `${Math.round(tokens / 1000)}K ctx`;
}

export function formatPricePerM(input?: number, output?: number): string | null {
  if (input === undefined && output === undefined) return null;
  const fmt = (n: number | undefined) =>
    n === undefined ? "?" : n === 0 ? "free" : `$${+n.toFixed(2)}`;
  return `${fmt(input)} / ${fmt(output)} per M`;
}

/** Translator for the `labels.ai.modelSource` catalog namespace. */
export type ModelSourceTranslator = (
  key: "builtin" | "updated" | "updatedJustNow" | "updatedMinutesAgo" | "updatedHoursAgo" | "updatedDaysAgo",
  values?: { count: number },
) => string;

export function describeModelSource(
  source: ModelListSource,
  fetchedAt: string | null,
  t: ModelSourceTranslator,
  now = Date.now(),
): string {
  if (source === "builtin" || source === "snapshot") return t("builtin");
  if (!fetchedAt) return t("updated");
  const minutes = Math.max(0, Math.round((now - new Date(fetchedAt).getTime()) / 60_000));
  if (minutes < 1) return t("updatedJustNow");
  if (minutes < 60) return t("updatedMinutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return t("updatedHoursAgo", { count: hours });
  return t("updatedDaysAgo", { count: Math.round(hours / 24) });
}
