"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { generateText } from "ai";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { getWorkspaceAiConfig, getWorkspaceAiStatus } from "@/lib/ai/config";
import { fetchOpenRouterModels, getModel } from "@/lib/ai/registry";
import { isAiProviderId, type OpenRouterModel } from "@/lib/ai/providers";

export type AiSettingsActionResult = { ok: boolean; error?: string };

const saveSchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().trim().min(1, "Choose a model.").max(200),
  apiKey: z.string().trim().max(500).optional(),
  baseUrl: z.string().trim().max(500).optional(),
  enabled: z.boolean(),
  autoScore: z.boolean().optional(),
});

export async function saveAiSettingsAction(input: {
  provider: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
  autoScore?: boolean;
}): Promise<AiSettingsActionResult> {
  const context = await requirePermission("settings:edit");

  if (!isEncryptionConfigured()) {
    return {
      ok: false,
      error: "Server is missing AI_ENCRYPTION_KEY. Set it to enable AI.",
    };
  }

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid settings.",
    };
  }

  const { provider, modelId, apiKey, baseUrl, enabled, autoScore } = parsed.data;
  if (!isAiProviderId(provider)) {
    return { ok: false, error: "Unknown provider." };
  }

  const status = await getWorkspaceAiStatus(context.organization.id);
  if (enabled && !apiKey && !status.hasApiKey) {
    return { ok: false, error: "Add an API key before enabling AI." };
  }

  const encrypted = apiKey ? encryptSecret(apiKey) : null;
  const keyColumns = encrypted
    ? {
        aiApiKeyCiphertext: encrypted.ciphertext,
        aiApiKeyIv: encrypted.iv,
        aiApiKeyTag: encrypted.tag,
      }
    : {};

  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      aiEnabled: enabled,
      aiProvider: provider,
      aiModelId: modelId,
      aiBaseUrl: baseUrl || null,
      aiAutoScore: autoScore ?? false,
      ...keyColumns,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: {
        aiEnabled: enabled,
        aiProvider: provider,
        aiModelId: modelId,
        aiBaseUrl: baseUrl || null,
        aiAutoScore: autoScore ?? false,
        ...keyColumns,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/settings");
  return { ok: true };
}

export async function disableAiAction(): Promise<AiSettingsActionResult> {
  const context = await requirePermission("settings:edit");

  await db
    .update(workspaceSettings)
    .set({ aiEnabled: false, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath("/settings");
  return { ok: true };
}

export async function testAiConnectionAction(input: {
  provider: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<AiSettingsActionResult> {
  const context = await requirePermission("settings:edit");

  if (!isEncryptionConfigured()) {
    return { ok: false, error: "Server is missing AI_ENCRYPTION_KEY." };
  }
  if (!isAiProviderId(input.provider)) {
    return { ok: false, error: "Unknown provider." };
  }
  if (!input.modelId.trim()) {
    return { ok: false, error: "Choose a model first." };
  }

  let apiKey = input.apiKey?.trim();
  if (!apiKey) {
    const config = await getWorkspaceAiConfig(context.organization.id);
    if (!config) {
      return { ok: false, error: "Enter an API key to test." };
    }
    apiKey = config.apiKey;
  }

  try {
    const model = getModel({
      provider: input.provider,
      modelId: input.modelId.trim(),
      apiKey,
      baseUrl: input.baseUrl,
    });
    const { text } = await generateText({
      model,
      prompt: "Reply with the single word: OK",
      maxOutputTokens: 16,
    });
    return text.trim()
      ? { ok: true }
      : { ok: false, error: "The model returned an empty response." };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Connection failed: ${error.message}`
          : "Connection failed.",
    };
  }
}

export async function saveAiAutoScoreAction(
  autoScore: boolean,
): Promise<AiSettingsActionResult> {
  const context = await requirePermission("settings:edit");

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, aiAutoScore: autoScore })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { aiAutoScore: autoScore, updatedAt: new Date() },
    });

  revalidatePath("/settings/ai");
  return { ok: true };
}

export async function saveAiDuplicateCheckAction(
  duplicateCheck: boolean,
): Promise<AiSettingsActionResult> {
  const context = await requirePermission("settings:edit");

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, aiDuplicateCheck: duplicateCheck })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { aiDuplicateCheck: duplicateCheck, updatedAt: new Date() },
    });

  revalidatePath("/settings/ai");
  return { ok: true };
}

export async function searchOpenRouterModelsAction(
  query: string,
): Promise<OpenRouterModel[]> {
  await requirePermission("settings:edit");

  const all = await fetchOpenRouterModels();
  const q = query.trim().toLowerCase();
  const filtered = q
    ? all.filter(
        (model) =>
          model.id.toLowerCase().includes(q) ||
          model.name.toLowerCase().includes(q),
      )
    : all;

  return filtered.slice(0, 50);
}
