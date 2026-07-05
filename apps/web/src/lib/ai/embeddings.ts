import "server-only";

import { embed, cosineSimilarity as aiCosineSimilarity } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import type { AiModelConfig } from "@/lib/ai/providers";

/**
 * Semantic match needs one fixed embedding model shared across a workspace's
 * whole candidate/job corpus (mixing models would make vectors incomparable).
 * BYOK chat providers vary (Anthropic/Google/xAI don't expose embeddings via
 * the AI SDK the same way), so this only lights up when the workspace's
 * configured provider is OpenAI — same key, no separate credential to manage.
 */
export const EMBEDDING_MODEL_ID = "text-embedding-3-small";

export function supportsEmbeddings(
  config: AiModelConfig | null,
): config is AiModelConfig {
  return config?.provider === "openai";
}

/** Embed a single piece of text. Caps input to keep cost and latency bounded. */
export async function embedText(config: AiModelConfig, text: string): Promise<number[]> {
  const openai = createOpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
  const { embedding } = await embed({
    model: openai.embeddingModel(EMBEDDING_MODEL_ID),
    value: text.slice(0, 8000),
  });
  return embedding;
}

export const cosineSimilarity = aiCosineSimilarity;
