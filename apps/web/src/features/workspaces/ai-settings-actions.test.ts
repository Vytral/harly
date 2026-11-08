import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getWorkspaceAiConfig: vi.fn(),
  getWorkspaceAiStatus: vi.fn(),
  generateText: vi.fn(),
  insertValues: vi.fn(),
  getProviderModels: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/demo/assert-not-demo", () => ({ assertNotDemo: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/crypto", () => ({
  encryptSecret: (value: string) => ({ ciphertext: `enc:${value}`, iv: "iv", tag: "tag" }),
  isEncryptionConfigured: () => true,
}));
vi.mock("@/lib/ai/config", () => ({
  getWorkspaceAiConfig: mocks.getWorkspaceAiConfig,
  getWorkspaceAiStatus: mocks.getWorkspaceAiStatus,
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));
vi.mock("@/lib/ai/models-catalog", () => ({ getProviderModels: mocks.getProviderModels }));
vi.mock("@harly/db", () => ({
  db: {
    insert: () => ({
      values: (v: unknown) => {
        mocks.insertValues(v);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  },
  organization: {},
  workspaceSettings: { organizationId: "organizationId" },
}));

import {
  listProviderModelsAction,
  saveAiSettingsAction,
  testAiConnectionAction,
} from "./ai-settings-actions";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.HARLY_ALLOW_LOCAL_LLM;
  mocks.requirePermission.mockResolvedValue({ organization: { id: "org-1" } });
  mocks.getWorkspaceAiStatus.mockResolvedValue({ hasApiKey: false, provider: null });
  mocks.getWorkspaceAiConfig.mockResolvedValue(null);
  mocks.generateText.mockResolvedValue({ text: "OK" });
});

describe("saveAiSettingsAction", () => {
  it("stores a custom endpoint for OpenAI-compatible providers", async () => {
    const result = await saveAiSettingsAction({
      provider: "openai-compatible",
      modelId: "my-model",
      apiKey: "k",
      baseUrl: "https://gateway.example.com/v1",
      enabled: true,
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ aiBaseUrl: "https://gateway.example.com/v1", aiProvider: "openai-compatible" }),
    );
  });

  it("returns the host error to the UI for a foreign host on a hosted provider", async () => {
    const result = await saveAiSettingsAction({
      provider: "openai",
      modelId: "gpt-5.4-mini",
      apiKey: "k",
      baseUrl: "https://evil.example.com/v1",
      enabled: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Host not allowed for OpenAI/);
  });

  it("explains how to enable local servers", async () => {
    const result = await saveAiSettingsAction({
      provider: "ollama",
      modelId: "llama3.1",
      baseUrl: "http://localhost:11434/v1",
      enabled: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/HARLY_ALLOW_LOCAL_LLM=1/);
  });

  it("saves keyless providers with a placeholder key once local is allowed", async () => {
    process.env.HARLY_ALLOW_LOCAL_LLM = "1";
    const result = await saveAiSettingsAction({
      provider: "ollama",
      modelId: "llama3.1",
      baseUrl: "http://localhost:11434/v1",
      enabled: true,
    });
    expect(result.ok).toBe(true);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ aiApiKeyCiphertext: "enc:no-key" }),
    );
  });

  it("validates Ollama's implicit localhost endpoint before saving", async () => {
    const settings = { provider: "ollama", modelId: "llama3.1", enabled: true };
    const blocked = await saveAiSettingsAction(settings);
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/HARLY_ALLOW_LOCAL_LLM=1/);
    expect(mocks.insertValues).not.toHaveBeenCalled();
    process.env.HARLY_ALLOW_LOCAL_LLM = "1";
    await expect(saveAiSettingsAction(settings)).resolves.toEqual({ ok: true });
  });

  it("does not reuse a stored key for a different provider", async () => {
    mocks.getWorkspaceAiStatus.mockResolvedValue({ hasApiKey: true, provider: "openai" });
    const result = await saveAiSettingsAction({
      provider: "groq",
      modelId: "llama-3.3-70b-versatile",
      enabled: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Groq API key/);
  });

  it("requires an endpoint for Azure and the generic provider", async () => {
    const result = await saveAiSettingsAction({
      provider: "azure",
      modelId: "dep",
      apiKey: "k",
      enabled: true,
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/endpoint/i) });
  });
});

describe("testAiConnectionAction", () => {
  it("tests through the custom endpoint", async () => {
    let seenModel: unknown;
    mocks.generateText.mockImplementation(async ({ model }: { model: unknown }) => {
      seenModel = model;
      return { text: "OK" };
    });
    const result = await testAiConnectionAction({
      provider: "openai-compatible",
      modelId: "m",
      apiKey: "k",
      baseUrl: "https://gateway.example.com/v1",
    });
    expect(result).toEqual({ ok: true });
    expect(seenModel).toBeTruthy();
  });

  it("surfaces validation errors instead of silently using the default endpoint", async () => {
    const result = await testAiConnectionAction({
      provider: "anthropic",
      modelId: "claude-sonnet-5",
      apiKey: "k",
      baseUrl: "https://proxy.example.com",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Host not allowed for Anthropic/);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("does not reuse the stored key of another provider", async () => {
    mocks.getWorkspaceAiConfig.mockResolvedValue({ provider: "openai", apiKey: "stored" });
    const result = await testAiConnectionAction({ provider: "groq", modelId: "m" });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/Groq API key/) });
  });

  it("redacts the key from provider errors", async () => {
    mocks.generateText.mockRejectedValue(new Error("bad key super-secret-key-123"));
    const result = await testAiConnectionAction({ provider: "groq", modelId: "m", apiKey: "super-secret-key-123" });
    expect(result.error).not.toContain("super-secret-key-123");
  });
});

describe("listProviderModelsAction", () => {
  it("maps the models.dev provider and returns its source", async () => {
    mocks.getProviderModels.mockResolvedValue({
      models: [{ id: "m1", name: "M1", toolCall: true }],
      source: "live",
      fetchedAt: "2026-11-07T00:00:00.000Z",
    });
    const result = await listProviderModelsAction({ provider: "fireworks" });
    expect(mocks.getProviderModels).toHaveBeenCalledWith("fireworks-ai", { forceRefresh: undefined });
    expect(result.source).toBe("live");
    expect(result.models[0]).toMatchObject({ id: "m1", fromCatalog: true });
  });

  it("falls back to the built-in list when the catalog fails or is empty", async () => {
    mocks.getProviderModels.mockRejectedValue(new Error("offline"));
    const result = await listProviderModelsAction({ provider: "groq" });
    expect(result.source).toBe("builtin");
    expect(result.models.map((m) => m.id)).toContain("llama-3.3-70b-versatile");
  });
});
