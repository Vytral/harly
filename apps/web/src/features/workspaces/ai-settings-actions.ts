"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { generateText } from "ai";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requireWorkspaceRole } from "@/features/workspaces/context";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { getWorkspaceAiConfig, getWorkspaceAiStatus } from "@/lib/ai/config";
import { fetchOpenRouterModels, getModel } from "@/lib/ai/registry";
import { isAiProviderId, type OpenRouterModel } from "@/lib/ai/providers";

export type AiSettingsActionResult = { ok: boolean; error?: string };

const saveSchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().trim().min(1, "Choose a model.").max(200),
  // Optional: when blank, the previously stored key is kept.
  apiKey: z.string().trim().max(500).optional(),
  enabled: z.boolean(),
});

export async function saveAiSettingsAction(input: {
  provider: string;
  modelId: string;
  apiKey?: string;
  enabled: boolean;
}): Promise<AiSettingsActionResult> {
  const context = await requireWorkspaceRole(["owner", "admin"]);

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

  const { provider, modelId, apiKey, enabled } = parsed.data;
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
      ...keyColumns,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: {
        aiEnabled: enabled,
        aiProvider: provider,
        aiModelId: modelId,
        ...keyColumns,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/settings");
  return { ok: true };
}

export async function disableAiAction(): Promise<AiSettingsActionResult> {
  const context = await requireWorkspaceRole(["owner", "admin"]);

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
}): Promise<AiSettingsActionResult> {
  const context = await requireWorkspaceRole(["owner", "admin"]);

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

export async function searchOpenRouterModelsAction(
  query: string,
): Promise<OpenRouterModel[]> {
  await requireWorkspaceRole(["owner", "admin"]);

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
