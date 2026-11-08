import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

import {
  getProvider,
  type AiModelConfig,
  type AiProviderKind,
  type OpenRouterModel,
} from "./providers";
import { assertSafeAiBaseUrl } from "./base-url";
import { xaiCompatibleFetch } from "./provider-tools";

type BuildArgs = { modelId: string; apiKey: string; baseUrl: string | undefined };
type FetchFn = typeof fetch;

/**
 * Azure OpenAI authenticates with an `api-key` header, not a bearer token, and
 * dated APIs need `?api-version=`. The AI SDK joins paths onto the base URL, so
 * the query is lifted off the base URL and re-attached to every request.
 */
export function splitAzureEndpoint(baseUrl: string): { baseURL: string; apiVersion: string | null } {
  const url = new URL(baseUrl);
  const apiVersion = url.searchParams.get("api-version");
  url.search = "";
  url.hash = "";
  return { baseURL: url.toString().replace(/\/$/, ""), apiVersion };
}

function azureFetch(apiKey: string, apiVersion: string | null, inner: FetchFn = fetch): FetchFn {
  return (async (input: Parameters<FetchFn>[0], init?: Parameters<FetchFn>[1]) => {
    const headers = new Headers(init?.headers);
    headers.delete("authorization");
    headers.set("api-key", apiKey);
    let target = input;
    if (apiVersion) {
      const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
      if (!url.searchParams.has("api-version")) url.searchParams.set("api-version", apiVersion);
      target = url.toString();
    }
    return inner(target, { ...init, headers });
  }) as FetchFn;
}

/**
 * The single place a provider kind becomes an AI SDK client. A new hosted
 * provider that speaks the OpenAI chat dialect needs no code here: add an entry
 * to `AI_PROVIDERS` with `kind: "openai-compatible"`.
 */
const FACTORIES: Record<AiProviderKind, (args: BuildArgs) => LanguageModel> = {
  openai: ({ modelId, apiKey, baseUrl }) =>
    createOpenAI({ apiKey, baseURL: baseUrl })(modelId),
  anthropic: ({ modelId, apiKey, baseUrl }) =>
    createAnthropic({ apiKey, baseURL: baseUrl })(modelId),
  google: ({ modelId, apiKey, baseUrl }) =>
    createGoogleGenerativeAI({ apiKey, baseURL: baseUrl })(modelId),
  xai: ({ modelId, apiKey, baseUrl }) =>
    createXai({ apiKey, baseURL: baseUrl, fetch: xaiCompatibleFetch })(modelId),
  openrouter: ({ modelId, apiKey, baseUrl }) =>
    createOpenRouter({ apiKey, baseURL: baseUrl })(modelId),
  // Chat Completions is the lowest common denominator across gateways, so use
  // `.chat` rather than the Responses API that `createOpenAI()(id)` selects.
  "openai-compatible": ({ modelId, apiKey, baseUrl }) =>
    createOpenAI({ apiKey, baseURL: baseUrl }).chat(modelId),
  azure: ({ modelId, apiKey, baseUrl }) => {
    if (!baseUrl) throw new Error("Azure OpenAI needs your resource endpoint.");
    const { baseURL, apiVersion } = splitAzureEndpoint(baseUrl);
    return createOpenAI({
      apiKey,
      baseURL,
      fetch: azureFetch(apiKey, apiVersion),
    }).chat(modelId);
  },
};

/**
 * Endpoint a request will really use: the workspace's custom one, else the
 * provider default. Defaults are validated too (Ollama's default is local).
 */
export function resolveBaseUrl(config: Pick<AiModelConfig, "provider" | "baseUrl">): string | undefined {
  const info = getProvider(config.provider);
  if (config.baseUrl) return config.baseUrl;
  // Hosted SDK providers apply their own default; generic ones need ours.
  if (info?.kind === "openai-compatible") return info.baseUrl || undefined;
  return undefined;
}

/** Build a Vercel AI SDK LanguageModel for the given provider + key + model id. */
export function getModel(config: AiModelConfig): LanguageModel {
  const info = getProvider(config.provider);
  if (!info) throw new Error(`Unknown AI provider: ${config.provider as string}`);

  const baseUrl = resolveBaseUrl(config);
  if (info.requiresBaseUrl && !baseUrl) {
    throw new Error(`${info.label} needs an endpoint URL.`);
  }
  // Defense in depth: validated at save time, re-checked on every build.
  assertSafeAiBaseUrl(config.provider, baseUrl);

  return FACTORIES[info.kind]({
    modelId: config.modelId,
    apiKey: config.apiKey,
    baseUrl,
  });
}

/** Live OpenRouter catalog for the searchable model picker. Public endpoint. */
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };

    return (payload.data ?? []).map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      free: model.pricing?.prompt === "0" && model.pricing?.completion === "0",
    }));
  } catch {
    return [];
  }
}
