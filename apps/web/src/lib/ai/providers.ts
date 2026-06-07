/**
 * AI provider catalog — pure data + types, safe to import on the client (the
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
  /** Curated suggestions; free-text entry is always allowed. */
  models: AiModelOption[];
  /** OpenRouter: fetch the catalog live instead of using the static list. */
  supportsModelSearch: boolean;
};

export type AiModelConfig = {
  provider: AiProviderId;
  modelId: string;
  apiKey: string;
};

export type OpenRouterModel = { id: string; name: string; free: boolean };

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    apiKeyHint: "Create a secret key at platform.openai.com/api-keys.",
    supportsModelSearch: false,
    models: [
      { id: "gpt-5.1", label: "GPT-5.1" },
      { id: "gpt-5.1-mini", label: "GPT-5.1 mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    apiKeyHint: "Create a key at console.anthropic.com.",
    supportsModelSearch: false,
    models: [
      { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-3-5-haiku-latest", label: "Claude Haiku 3.5" },
    ],
  },
  {
    id: "google",
    label: "Google (Gemini)",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    apiKeyHint: "Create a key at aistudio.google.com.",
    supportsModelSearch: false,
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    apiKeyUrl: "https://console.x.ai",
    apiKeyHint: "Create a key at console.x.ai.",
    supportsModelSearch: false,
    models: [
      { id: "grok-4", label: "Grok 4" },
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 mini" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiKeyUrl: "https://openrouter.ai/keys",
    apiKeyHint:
      "One key routes to hundreds of models (incl. free). Create it at openrouter.ai/keys.",
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
