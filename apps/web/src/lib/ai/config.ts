import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { consumeDemoAiDailyBudget } from "./demo-budget";
import { getDemoAiModelConfig } from "./demo";
import { isAiProviderId, type AiModelConfig } from "./providers";

export type WorkspaceAiStatus = {
  enabled: boolean;
  provider: string | null;
  modelId: string | null;
  /** Optional custom API base URL. */
  baseUrl: string | null;
  /** True only when a key is stored (never the key itself). */
  hasApiKey: boolean;
  /** False when AI_ENCRYPTION_KEY is missing/invalid , AI can't be used. */
  encryptionReady: boolean;
  /** Automatically score new applications when AI is configured. */
  autoScore: boolean;
  /** Automatically flag potential duplicate candidates when a new application arrives. */
  duplicateCheck: boolean;
  /** Redact identifying candidate details from resumes during application review. */
  resumeAnonymization: boolean;
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
      aiAutoScore: workspaceSettings.aiAutoScore,
      aiDuplicateCheck: workspaceSettings.aiDuplicateCheck,
      aiResumeAnonymization: workspaceSettings.aiResumeAnonymization,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  const demoConfig = getDemoAiModelConfig(workspaceId);

  return {
    enabled: demoConfig ? true : Boolean(row?.aiEnabled),
    provider: demoConfig ? demoConfig.provider : (row?.aiProvider ?? null),
    modelId: demoConfig ? demoConfig.modelId : (row?.aiModelId ?? null),
    baseUrl: demoConfig ? null : (row?.aiBaseUrl ?? null),
    hasApiKey: demoConfig ? true : Boolean(row?.aiApiKeyCiphertext),
    encryptionReady: demoConfig ? true : isEncryptionConfigured(),
    // Background automations (auto-score on apply, duplicate checks) stay as
    // the workspace has them; the demo seed keeps them off so public applies
    // on the demo board can't spend the platform key.
    autoScore: Boolean(row?.aiAutoScore),
    duplicateCheck: Boolean(row?.aiDuplicateCheck),
    resumeAnonymization: Boolean(row?.aiResumeAnonymization),
  };
}

/**
 * Resolve a usable AI config (with decrypted key) for a workspace, or null when
 * AI is disabled / unconfigured / the master key is missing. Server-only.
 */
export async function getWorkspaceAiConfig(
  workspaceId: string,
  options: {
    /**
     * Spend one slot of the demo's daily budget as part of resolving. Callers
     * that validate the request first (the chat route) pass false and spend it
     * themselves right before calling the provider.
     */
    consumeDemoBudget?: boolean;
  } = {},
): Promise<AiModelConfig | null> {
  // Public demo: the reseed wipes the stored key, so AI comes from env. Each
  // AI operation spends one slot of the instance-wide daily budget; once it
  // runs out every surface falls back to its non-AI path until the window resets.
  const demoConfig = getDemoAiModelConfig(workspaceId);
  if (demoConfig) {
    if (options.consumeDemoBudget === false) return demoConfig;
    return (await consumeDemoAiDailyBudget()) ? demoConfig : null;
  }

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
