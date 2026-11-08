"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { generateText } from "ai";
import { z } from "zod";

import { db, organization, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { getWorkspaceAiConfig, getWorkspaceAiStatus } from "@/lib/ai/config";
import { fetchOpenRouterModels, getModel } from "@/lib/ai/registry";
import { assertSafeAiBaseUrl } from "@/lib/ai/base-url";
import {
  assistantBrandingSchema,
  writeAssistantBranding,
  type AssistantBranding,
} from "@/lib/ai/assistant-branding-shared";
import {
  KEYLESS_PLACEHOLDER,
  getProvider,
  isAiProviderId,
  type OpenRouterModel,
} from "@/lib/ai/providers";
import { getProviderModels } from "@/lib/ai/models-catalog";
import {
  buildModelOptions,
  type ProviderModelsResult,
} from "@/lib/ai/model-options";

import { assertNotDemo } from "@/features/demo/assert-not-demo";

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
  assertNotDemo();
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

  try {
    assertSafeAiBaseUrl(provider, baseUrl);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid AI baseUrl." };
  }

  const info = getProvider(provider)!;
  if (info.requiresBaseUrl && !baseUrl) {
    return { ok: false, error: `${info.label} needs an endpoint URL.` };
  }

  const status = await getWorkspaceAiStatus(context.organization.id);
  // A stored key belongs to the provider it was saved for; never carry it over
  // to a different provider (it would be sent to the wrong host).
  const keyReusable = status.hasApiKey && status.provider === provider;
  if (!apiKey && !keyReusable && info.requiresKey) {
    return {
      ok: false,
      error: `Add your ${info.label} API key${enabled ? " before enabling AI" : ""}.`,
    };
  }

  const effectiveKey =
    apiKey || (!keyReusable && !info.requiresKey ? KEYLESS_PLACEHOLDER : undefined);
  const encrypted = effectiveKey ? encryptSecret(effectiveKey) : null;
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
  assertNotDemo();
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
  assertNotDemo();
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
  try {
    assertSafeAiBaseUrl(input.provider, input.baseUrl?.trim() || undefined);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid AI baseUrl." };
  }

  const info = getProvider(input.provider)!;
  if (info.requiresBaseUrl && !input.baseUrl?.trim()) {
    return { ok: false, error: `${info.label} needs an endpoint URL.` };
  }

  let apiKey = input.apiKey?.trim();
  if (!apiKey) {
    const config = await getWorkspaceAiConfig(context.organization.id);
    if (config && config.provider === input.provider) {
      apiKey = config.apiKey;
    } else if (!info.requiresKey) {
      apiKey = KEYLESS_PLACEHOLDER;
    } else {
      return { ok: false, error: `Enter your ${info.label} API key to test.` };
    }
  }

  try {
    const model = getModel({
      provider: input.provider,
      modelId: input.modelId.trim(),
      apiKey,
      baseUrl: input.baseUrl?.trim() || undefined,
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
    const raw =
      error instanceof Error ? error.message : "Connection failed.";
    // Redact any API-key material (e.g. "Incorrect API key provided: sk-***AB")
    // before surfacing the provider's error to the client (IA-13).
    const redacted = raw
      .replace(/(sk-)[A-Za-z0-9_-]{4,}/g, "$1***REDACTED***")
      .split(apiKey)
      .join("***REDACTED***");
    return { ok: false, error: `Connection failed: ${redacted}` };
  }
}

export async function saveAiAutoScoreAction(
  autoScore: boolean,
): Promise<AiSettingsActionResult> {
  assertNotDemo();
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
  assertNotDemo();
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

export async function saveAiResumeAnonymizationAction(
  resumeAnonymization: boolean,
): Promise<AiSettingsActionResult> {
  assertNotDemo();
  const context = await requirePermission("settings:edit");

  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      aiResumeAnonymization: resumeAnonymization,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { aiResumeAnonymization: resumeAnonymization, updatedAt: new Date() },
    });

  revalidatePath("/settings/ai");
  return { ok: true };
}

export async function searchOpenRouterModelsAction(
  query: string,
): Promise<OpenRouterModel[]> {
  assertNotDemo();
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

/** Save the Harly AI assistant's name / avatar / "Powered by" flag (stored in organization.metadata). */
export async function saveAssistantBrandingAction(
  input: AssistantBranding,
): Promise<AiSettingsActionResult> {
  assertNotDemo();
  const context = await requirePermission("settings:edit");

  const parsed = assistantBrandingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid assistant settings.",
    };
  }

  const [row] = await db
    .select({ metadata: organization.metadata })
    .from(organization)
    .where(eq(organization.id, context.organization.id))
    .limit(1);

  // Merge into the existing metadata so unrelated keys survive.
  const next = writeAssistantBranding(row?.metadata, parsed.data);
  await db
    .update(organization)
    .set({ metadata: next })
    .where(eq(organization.id, context.organization.id));

  revalidatePath("/settings/ai");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Model list for the settings picker. Reads models.dev through the shared
 * catalog (live, cached or the bundled snapshot) and never touches API keys.
 */
export async function listProviderModelsAction(input: {
  provider: string;
  forceRefresh?: boolean;
}): Promise<ProviderModelsResult> {
  assertNotDemo();
  await requirePermission("settings:edit");

  const info = isAiProviderId(input.provider) ? getProvider(input.provider) : undefined;
  if (!info) return { models: [], source: "builtin", fetchedAt: null };

  if (info.catalogId) {
    try {
      const result = await getProviderModels(info.catalogId, {
        forceRefresh: input.forceRefresh,
      });
      if (result.models.length > 0) {
        return {
          models: buildModelOptions(info, result.models),
          source: result.source,
          fetchedAt: result.fetchedAt,
        };
      }
    } catch {
      // Fall through to the built-in list: the picker must never error out.
    }
  }

  if (info.supportsModelSearch) {
    const live = await fetchOpenRouterModels();
    if (live.length > 0) {
      return {
        models: live.map((model) => ({ id: model.id, name: model.name, fromCatalog: false })),
        source: "live",
        fetchedAt: new Date().toISOString(),
      };
    }
  }
  return { models: buildModelOptions(info, []), source: "builtin", fetchedAt: null };
}
