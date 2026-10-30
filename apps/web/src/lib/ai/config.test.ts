import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  getDemoAiModelConfig: vi.fn(),
  consumeDemoAiDailyBudget: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { select: mocks.select },
  workspaceSettings: {
    organizationId: {},
    aiEnabled: {},
    aiProvider: {},
    aiModelId: {},
    aiBaseUrl: {},
    aiApiKeyCiphertext: {},
    aiApiKeyIv: {},
    aiApiKeyTag: {},
    aiAutoScore: {},
    aiDuplicateCheck: {},
    aiResumeAnonymization: {},
  },
}));

vi.mock("@/lib/crypto", () => ({
  decryptSecret: () => "sk-test",
  isEncryptionConfigured: () => true,
}));

vi.mock("./demo", () => ({
  getDemoAiModelConfig: mocks.getDemoAiModelConfig,
}));

vi.mock("./demo-budget", () => ({
  consumeDemoAiDailyBudget: mocks.consumeDemoAiDailyBudget,
}));

import { getWorkspaceAiConfig } from "./config";

function selectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(rows),
  };
  return builder;
}

const WORKSPACE_ROW = {
  aiEnabled: true,
  aiProvider: "openai",
  aiModelId: "gpt-4o",
  aiBaseUrl: null,
  aiApiKeyCiphertext: "cipher",
  aiApiKeyIv: "iv",
  aiApiKeyTag: "tag",
  aiResumeAnonymization: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDemoAiModelConfig.mockReturnValue(null);
  mocks.consumeDemoAiDailyBudget.mockResolvedValue(true);
});

describe("getWorkspaceAiConfig resumeAnonymization", () => {
  it("carries the workspace anonymization setting on the resolved config", async () => {
    mocks.select.mockImplementation(() => selectReturning([WORKSPACE_ROW]));
    const config = await getWorkspaceAiConfig("ws-1");
    expect(config).toMatchObject({ provider: "openai", modelId: "gpt-4o", apiKey: "sk-test" });
    expect(config?.resumeAnonymization).toBe(true);
  });

  it("is false when the setting is off", async () => {
    mocks.select.mockImplementation(() =>
      selectReturning([{ ...WORKSPACE_ROW, aiResumeAnonymization: false }]),
    );
    const config = await getWorkspaceAiConfig("ws-1");
    expect(config?.resumeAnonymization).toBe(false);
  });

  it("carries the setting on the demo path too", async () => {
    mocks.getDemoAiModelConfig.mockReturnValue({ provider: "openai", modelId: "gpt-4o", apiKey: "demo" });
    mocks.select.mockImplementation(() => selectReturning([{ aiResumeAnonymization: true }]));
    const config = await getWorkspaceAiConfig("ws-demo", { consumeDemoBudget: false });
    expect(config).toMatchObject({ apiKey: "demo", resumeAnonymization: true });
  });

  it("returns null without a config when AI is disabled", async () => {
    mocks.select.mockImplementation(() => selectReturning([{ ...WORKSPACE_ROW, aiEnabled: false }]));
    expect(await getWorkspaceAiConfig("ws-1")).toBeNull();
  });
});
