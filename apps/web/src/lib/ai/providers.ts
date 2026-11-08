/**
 * AI provider catalog , pure data + types, safe to import on the client (the
 * settings UI renders these). Server-only behaviour (building models, fetching
 * live catalogs) lives in `./registry`.
 */

export const AI_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "openrouter",
  "groq",
  "deepseek",
  "mistral",
  "togetherai",
  "fireworks",
  "cerebras",
  "azure",
  "ollama",
  "openai-compatible",
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

/**
 * How a provider's client is built (see `registry.ts`). Most hosted providers
 * speak the OpenAI chat-completions dialect, so they share the
 * `openai-compatible` kind and only differ by data in `AI_PROVIDERS`.
 */
export type AiProviderKind =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "openrouter"
  | "azure"
  | "openai-compatible";

export type AiModelOption = { id: string; label: string };

export type AiProviderInfo = {
  id: AiProviderId;
  kind: AiProviderKind;
  label: string;
  /** One-line description shown in the provider picker. */
  tagline: string;
  /** models.dev provider id used for the live model list (none = free text). */
  catalogId?: string;
  /** Example model ID shown as the placeholder. */
  modelExample: string;
  /** False for local runtimes (Ollama) and optional-key gateways. */
  requiresKey: boolean;
  /** True when the user must enter the endpoint (no usable default). */
  requiresBaseUrl: boolean;
  /**
   * Hosts a custom endpoint may use. Exact hostnames, `.suffix` entries match
   * subdomains, `*` allows any public https host (gateways / proxies).
   */
  allowedHosts: string[];
  /**
   * Endpoint may point at a private / LAN / localhost address (Ollama, LM
   * Studio, vLLM). Still requires HARLY_ALLOW_LOCAL_LLM=1 on the server.
   */
  allowPrivateHosts: boolean;
  /** Embeddings (semantic match) are available with this provider. */
  supportsEmbeddings: boolean;
  /** Short help for the endpoint field. */
  baseUrlHelp: string;
  apiKeyUrl: string;
  /** Where the user gets a key, shown under the input. */
  apiKeyHint: string;
  /** Default API base URL (overridable via custom endpoint). */
  baseUrl: string;
  /** Curated suggestions; free-text entry is always allowed. */
  models: AiModelOption[];
  /** OpenRouter: fetch the catalog live instead of using the static list. */
  supportsModelSearch: boolean;
};

export type AiModelConfig = {
  provider: AiProviderId;
  modelId: string;
  apiKey: string;
  /** Optional custom API base URL. */
  baseUrl?: string;
};

export type OpenRouterModel = { id: string; name: string; free: boolean };

/**
 * Format a model ID into a human-readable label.
 * "gpt-5.6-terra"           → "GPT 5.6 Terra"
 * "claude-sonnet-5"         → "Claude Sonnet 5"
 * "gemini-3.6-flash"         → "Gemini 3.6 Flash"
 */
export function formatModelLabel(id: string): string {
  // Strip trailing date-like suffix (e.g. -2026-03-17)
  const cleaned = id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return cleaned
    .split("-")
    .map((part, i) => {
      // Keep numbers/version strings as-is (4o, 2.5, 5.4, etc.)
      if (/^[\d.]+$/.test(part)) return part;
      if (/^[\d.]+[a-z]$/i.test(part)) return part; // 4o, 3p5
      // Always capitalize first word; capitalize subsequent semantic words
      return i === 0
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : [
              "mini",
              "max",
              "pro",
              "ultra",
              "flash",
              "lite",
              "haiku",
              "sonnet",
              "opus",
              "fable",
              "terra",
              "sol",
              "luna",
              "nano",
              "turbo",
            ].includes(part.toLowerCase())
          ? part.charAt(0).toUpperCase() + part.slice(1)
          : part;
    })
    .join(" ");
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: "openai",
    kind: "openai",
    tagline: "GPT models, direct from OpenAI.",
    catalogId: "openai",
    modelExample: "gpt-5.4-mini",
    requiresKey: true,
    requiresBaseUrl: false,
    allowedHosts: ["api.openai.com"],
    allowPrivateHosts: false,
    supportsEmbeddings: true,
    baseUrlHelp:
      "Only needed for a proxy or gateway; it must be a https host that this provider allows.",
    label: "OpenAI",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    apiKeyHint: "Create a secret key at platform.openai.com/api-keys.",
    baseUrl: "https://api.openai.com/v1",
    supportsModelSearch: false,
    models: [
      { id: "gpt-5.6-sol", label: "GPT 5.6 Sol" },
      { id: "gpt-5.6-terra", label: "GPT 5.6 Terra" },
      { id: "gpt-5.6-luna", label: "GPT 5.6 Luna" },
      { id: "gpt-5.5", label: "GPT 5.5" },
      { id: "gpt-5.5-pro", label: "GPT 5.5 Pro" },
      { id: "gpt-5.4", label: "GPT 5.4" },
      { id: "gpt-5.4-pro", label: "GPT 5.4 Pro" },
      { id: "gpt-5.4-mini", label: "GPT 5.4 Mini" },
      { id: "gpt-5.4-nano", label: "GPT 5.4 Nano" },
      { id: "gpt-5-mini", label: "GPT 5 Mini" },
      { id: "gpt-5-nano", label: "GPT 5 Nano" },
    ],
  },
  {
    id: "anthropic",
    kind: "anthropic",
    tagline: "Claude models, direct from Anthropic.",
    catalogId: "anthropic",
    modelExample: "claude-sonnet-5",
    requiresKey: true,
    requiresBaseUrl: false,
    allowedHosts: ["api.anthropic.com"],
    allowPrivateHosts: false,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Only needed for a proxy or gateway; it must be a https host that this provider allows.",
    label: "Anthropic",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    apiKeyHint: "Create a key at console.anthropic.com.",
    baseUrl: "https://api.anthropic.com/v1",
    supportsModelSearch: false,
    models: [
      { id: "claude-fable-5", label: "Claude Fable 5" },
      { id: "claude-opus-5", label: "Claude Opus 5" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
      { id: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
      { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5 (Pinned)" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Pinned)" },
    ],
  },
  {
    id: "google",
    kind: "google",
    tagline: "Gemini models from Google AI Studio.",
    catalogId: "google",
    modelExample: "gemini-2.5-flash",
    requiresKey: true,
    requiresBaseUrl: false,
    allowedHosts: ["generativelanguage.googleapis.com"],
    allowPrivateHosts: false,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Only needed for a proxy or gateway; it must be a https host that this provider allows.",
    label: "Google Gemini",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    apiKeyHint: "Create a key at aistudio.google.com.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    supportsModelSearch: false,
    models: [
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
      { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    ],
  },
  {
    id: "xai",
    kind: "xai",
    tagline: "Grok models from xAI.",
    catalogId: "xai",
    modelExample: "grok-4.3",
    requiresKey: true,
    requiresBaseUrl: false,
    allowedHosts: ["api.x.ai"],
    allowPrivateHosts: false,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Only needed for a proxy or gateway; it must be a https host that this provider allows.",
    label: "xAI",
    apiKeyUrl: "https://console.x.ai",
    apiKeyHint: "Create a key at console.x.ai.",
    baseUrl: "https://api.x.ai/v1",
    supportsModelSearch: false,
    models: [
      { id: "grok-4.5", label: "Grok 4.5" },
      { id: "grok-4.3", label: "Grok 4.3" },
    ],
  },
  {
    id: "openrouter",
    kind: "openrouter",
    tagline: "One key, hundreds of models (including free).",
    catalogId: "openrouter",
    modelExample: "openai/gpt-4o-mini",
    requiresKey: true,
    requiresBaseUrl: false,
    allowedHosts: ["openrouter.ai"],
    allowPrivateHosts: false,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Only needed for a proxy or gateway; it must be a https host that this provider allows.",
    label: "OpenRouter",
    apiKeyUrl: "https://openrouter.ai/keys",
    apiKeyHint:
      "One key routes to hundreds of models (incl. free). Create it at openrouter.ai/keys.",
    baseUrl: "https://openrouter.ai/api/v1",
    supportsModelSearch: true,
    models: [],
  },
  {
    id: "groq",
    kind: "openai-compatible",
    tagline: "Very fast open-weight models on Groq.",
    catalogId: "groq",
    modelExample: "llama-3.3-70b-versatile",
    requiresKey: true,
    requiresBaseUrl: false,
    allowedHosts: ["api.groq.com"],
    allowPrivateHosts: false,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Only needed for a proxy or gateway; it must be a https host that this provider allows.",
    label: "Groq",
    apiKeyUrl: "https://console.groq.com/keys",
    apiKeyHint: "Create a key at console.groq.com/keys.",
    baseUrl: "https://api.groq.com/openai/v1",
    supportsModelSearch: false,
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { id: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
    ],
  },
  {
    id: "deepseek",
    kind: "openai-compatible",
    tagline: "DeepSeek chat and reasoning models.",
    catalogId: "deepseek",
    modelExample: "deepseek-chat",
    requiresKey: true,
    requiresBaseUrl: false,
    allowedHosts: ["api.deepseek.com"],
    allowPrivateHosts: false,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Only needed for a proxy or gateway; it must be a https host that this provider allows.",
    label: "DeepSeek",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    apiKeyHint: "Create a key at platform.deepseek.com.",
    baseUrl: "https://api.deepseek.com/v1",
    supportsModelSearch: false,
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
  },
  {
    id: "mistral",
    kind: "openai-compatible",
    tagline: "Mistral Large, Medium and Small.",
    catalogId: "mistral",
    modelExample: "mistral-large-latest",
    requiresKey: true,
    requiresBaseUrl: false,
    allowedHosts: ["api.mistral.ai"],
    allowPrivateHosts: false,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Only needed for a proxy or gateway; it must be a https host that this provider allows.",
    label: "Mistral",
    apiKeyUrl: "https://console.mistral.ai/api-keys",
    apiKeyHint: "Create a key at console.mistral.ai.",
    baseUrl: "https://api.mistral.ai/v1",
    supportsModelSearch: false,
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "mistral-medium-latest", label: "Mistral Medium" },
      { id: "mistral-small-latest", label: "Mistral Small" },
    ],
  },
  {
    id: "togetherai",
    kind: "openai-compatible",
    tagline: "Open-weight models hosted on Together AI.",
    catalogId: "togetherai",
    modelExample: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    requiresKey: true,
    requiresBaseUrl: false,
    allowedHosts: ["api.together.xyz","api.together.ai"],
    allowPrivateHosts: false,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Only needed for a proxy or gateway; it must be a https host that this provider allows.",
    label: "Together AI",
    apiKeyUrl: "https://api.together.ai/settings/api-keys",
    apiKeyHint: "Create a key at api.together.ai.",
    baseUrl: "https://api.together.xyz/v1",
    supportsModelSearch: false,
    models: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        label: "Llama 3.3 70B Instruct Turbo",
      },
      { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3" },
    ],
  },
  {
    id: "fireworks",
    kind: "openai-compatible",
    tagline: "Fast open-weight models on Fireworks AI.",
    catalogId: "fireworks-ai",
    modelExample: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    requiresKey: true,
    requiresBaseUrl: false,
    allowedHosts: ["api.fireworks.ai"],
    allowPrivateHosts: false,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Only needed for a proxy or gateway; it must be a https host that this provider allows.",
    label: "Fireworks AI",
    apiKeyUrl: "https://fireworks.ai/account/api-keys",
    apiKeyHint: "Create a key at fireworks.ai.",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    supportsModelSearch: false,
    models: [
      {
        id: "accounts/fireworks/models/llama-v3p3-70b-instruct",
        label: "Llama 3.3 70B Instruct",
      },
    ],
  },
  {
    id: "cerebras",
    kind: "openai-compatible",
    tagline: "Very low-latency inference on Cerebras.",
    catalogId: "cerebras",
    modelExample: "llama-3.3-70b",
    requiresKey: true,
    requiresBaseUrl: false,
    allowedHosts: ["api.cerebras.ai"],
    allowPrivateHosts: false,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Only needed for a proxy or gateway; it must be a https host that this provider allows.",
    label: "Cerebras",
    apiKeyUrl: "https://cloud.cerebras.ai",
    apiKeyHint: "Create a key at cloud.cerebras.ai.",
    baseUrl: "https://api.cerebras.ai/v1",
    supportsModelSearch: false,
    models: [
      { id: "llama-3.3-70b", label: "Llama 3.3 70B" },
      { id: "gpt-oss-120b", label: "GPT OSS 120B" },
    ],
  },
  {
    id: "azure",
    kind: "azure",
    tagline: "OpenAI models deployed in your Azure resource.",
    catalogId: "azure",
    modelExample: "my-gpt-deployment",
    requiresKey: true,
    requiresBaseUrl: true,
    allowedHosts: [".openai.azure.com", ".cognitiveservices.azure.com", ".services.ai.azure.com"],
    allowPrivateHosts: false,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Your Azure resource endpoint, e.g. https://my-resource.openai.azure.com/openai/v1. The model field is your deployment name. Append ?api-version=… only if you use a dated API.",
    label: "Azure OpenAI",
    apiKeyUrl: "https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI",
    apiKeyHint: "Copy a key from your Azure OpenAI resource (Keys and Endpoint).",
    baseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai/v1",
    supportsModelSearch: false,
    models: [],
  },
  {
    id: "ollama",
    kind: "openai-compatible",
    tagline: "Models running locally with Ollama. No key needed.",
    modelExample: "llama3.1",
    requiresKey: false,
    requiresBaseUrl: false,
    allowedHosts: ["*"],
    allowPrivateHosts: true,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Ollama listens on http://localhost:11434/v1. Local and LAN addresses need HARLY_ALLOW_LOCAL_LLM=1 on the server.",
    label: "Ollama (local)",
    apiKeyUrl: "https://ollama.com/download",
    apiKeyHint: "No key needed. Install Ollama and pull a model.",
    baseUrl: "http://localhost:11434/v1",
    supportsModelSearch: false,
    models: [
      { id: "llama3.1", label: "Llama 3.1" },
      { id: "qwen2.5", label: "Qwen 2.5" },
    ],
  },
  {
    id: "openai-compatible",
    kind: "openai-compatible",
    tagline: "Any OpenAI-compatible API: LiteLLM, vLLM, LM Studio, a gateway.",
    modelExample: "your-model-id",
    requiresKey: false,
    requiresBaseUrl: true,
    allowedHosts: ["*"],
    allowPrivateHosts: true,
    supportsEmbeddings: false,
    baseUrlHelp:
      "Base URL of the /v1 API. Public hosts must use https. Local and LAN addresses (LM Studio, vLLM) need HARLY_ALLOW_LOCAL_LLM=1 on the server.",
    label: "OpenAI-compatible",
    apiKeyUrl: "https://platform.openai.com/docs/api-reference",
    apiKeyHint: "Optional. Leave blank if your server needs no key.",
    baseUrl: "",
    supportsModelSearch: false,
    models: [],
  },
];

export function getProvider(id: string): AiProviderInfo | undefined {
  return AI_PROVIDERS.find((provider) => provider.id === id);
}

export function isAiProviderId(value: string): value is AiProviderId {
  return AI_PROVIDER_IDS.includes(value as AiProviderId);
}

/** Stored in place of a key for providers that need none (e.g. Ollama). */
export const KEYLESS_PLACEHOLDER = "no-key";

/** Whether the model/provider combination can have a usable endpoint at all. */
export function providerDefaultBaseUrl(id: string): string | undefined {
  return getProvider(id)?.baseUrl || undefined;
}
