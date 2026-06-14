import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { isAiProviderId, type AiModelConfig } from "./providers";

export type WorkspaceAiStatus = {
  enabled: boolean;
  provider: string | null;
  modelId: string | null;
  /** Optional custom API base URL. */
  baseUrl: string | null;
  /** True only when a key is stored (never the key itself). */
  hasApiKey: boolean;
  /** False when AI_ENCRYPTION_KEY is missing/invalid — AI can't be used. */
  encryptionReady: boolean;
};

/** Public-safe status for the settings UI. Never returns the API key. */
export async function getWorkspaceAiStatus(
  workspaceId: string,
): Promise<WorkspaceAiStatus> {
  const [row] = await db
    .select({
      aiEnabled: workspaceSettings.aiEnabled,
      aiProvider: workspaceSettings.aiProvider,
      aiModelId: workspaceSettings.aiModelId,
      aiBaseUrl: workspaceSettings.aiBaseUrl,
      aiApiKeyCiphertext: workspaceSettings.aiApiKeyCiphertext,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  return {
    enabled: Boolean(row?.aiEnabled),
    provider: row?.aiProvider ?? null,
    modelId: row?.aiModelId ?? null,
    baseUrl: row?.aiBaseUrl ?? null,
    hasApiKey: Boolean(row?.aiApiKeyCiphertext),
    encryptionReady: isEncryptionConfigured(),
  };
}

/**
 * Resolve a usable AI config (with decrypted key) for a workspace, or null when
 * AI is disabled / unconfigured / the master key is missing. Server-only.
 */
export async function getWorkspaceAiConfig(
  workspaceId: string,
): Promise<AiModelConfig | null> {
  if (!isEncryptionConfigured()) {
    return null;
  }

  const [row] = await db
    .select({
      aiEnabled: workspaceSettings.aiEnabled,
      aiProvider: workspaceSettings.aiProvider,
      aiModelId: workspaceSettings.aiModelId,
      aiBaseUrl: workspaceSettings.aiBaseUrl,
      aiApiKeyCiphertext: workspaceSettings.aiApiKeyCiphertext,
      aiApiKeyIv: workspaceSettings.aiApiKeyIv,
      aiApiKeyTag: workspaceSettings.aiApiKeyTag,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (
    !row ||
    !row.aiEnabled ||
    !row.aiProvider ||
    !isAiProviderId(row.aiProvider) ||
    !row.aiModelId ||
    !row.aiApiKeyCiphertext ||
    !row.aiApiKeyIv ||
    !row.aiApiKeyTag
  ) {
    return null;
  }

  try {
    const apiKey = decryptSecret({
      ciphertext: row.aiApiKeyCiphertext,
      iv: row.aiApiKeyIv,
      tag: row.aiApiKeyTag,
    });

    return { provider: row.aiProvider, modelId: row.aiModelId, apiKey, baseUrl: row.aiBaseUrl ?? undefined };
  } catch {
    return null;
  }
}
