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
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export type AiModelOption = { id: string; label: string };

export type AiProviderInfo = {
  id: AiProviderId;
  label: string;
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
    label: "OpenRouter",
    apiKeyUrl: "https://openrouter.ai/keys",
    apiKeyHint:
      "One key routes to hundreds of models (incl. free). Create it at openrouter.ai/keys.",
    baseUrl: "https://openrouter.ai/api/v1",
    supportsModelSearch: true,
    models: [],
  },
];

export function getProvider(id: string): AiProviderInfo | undefined {
  return AI_PROVIDERS.find((provider) => provider.id === id);
}

export function isAiProviderId(value: string): value is AiProviderId {
  return AI_PROVIDER_IDS.includes(value as AiProviderId);
}
