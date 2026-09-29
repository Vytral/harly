import { beforeEach, describe, expect, it, vi } from "vitest";

const { enforceRateLimit } = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/server/api/ratelimit", () => ({
  enforcePersistentRateLimit: enforceRateLimit,
}));

import {
  DEMO_BLOCKED_AGENT_TOOLS,
  getDemoAiModelConfig,
  isDemoBlockedAgentTool,
  withDemoSystemNote,
  withoutDemoBlockedTools,
} from "./demo";
import { consumeDemoAiDailyBudget } from "./demo-budget";
import { AGENT_WRITE_TOOLS } from "./agent/write-tool-names";

const DEMO_ENV = {
  DEMO_MODE: "true",
  DEMO_AI_API_KEY: "sk-test-demo",
  DEMO_AI_MODEL: "gpt-6-luna",
};

describe("getDemoAiModelConfig", () => {
  it("returns the env-backed OpenAI config on a demo instance", () => {
    expect(getDemoAiModelConfig("ws-1", DEMO_ENV)).toEqual({
      provider: "openai",
      modelId: "gpt-6-luna",
      apiKey: "sk-test-demo",
    });
  });

  it("never uses the key outside demo mode", () => {
    expect(getDemoAiModelConfig("ws-1", { ...DEMO_ENV, DEMO_MODE: "false" })).toBeNull();
    expect(getDemoAiModelConfig("ws-1", { DEMO_AI_API_KEY: "sk-test-demo" })).toBeNull();
  });

  it("is off when no key is configured", () => {
    expect(getDemoAiModelConfig("ws-1", { DEMO_MODE: "true", DEMO_AI_API_KEY: "  " })).toBeNull();
  });

  it("defaults the model to gpt-6-luna", () => {
    expect(
      getDemoAiModelConfig("ws-1", { DEMO_MODE: "true", DEMO_AI_API_KEY: "k" })?.modelId,
    ).toBe("gpt-6-luna");
  });

  it("respects the pinned DEMO_WORKSPACE_ID", () => {
    const env = { ...DEMO_ENV, DEMO_WORKSPACE_ID: "ws-demo" };
    expect(getDemoAiModelConfig("ws-demo", env)).not.toBeNull();
    expect(getDemoAiModelConfig("ws-other", env)).toBeNull();
  });
});

describe("consumeDemoAiDailyBudget", () => {
  beforeEach(() => {
    enforceRateLimit.mockReset();
  });

  it("consumes the shared daily window with the configured limit on the DB store", async () => {
    enforceRateLimit.mockResolvedValue({ remaining: 10 });
    await expect(
      consumeDemoAiDailyBudget({ ...DEMO_ENV, DEMO_AI_DAILY_REQUEST_LIMIT: "50" }),
    ).resolves.toBe(true);
    expect(enforceRateLimit).toHaveBeenCalledWith("demo-ai:daily", {
      limit: 50,
      windowMs: 86_400_000,
    });
  });

  it("uses the default limit when unset", async () => {
    enforceRateLimit.mockResolvedValue({ remaining: 10 });
    await consumeDemoAiDailyBudget(DEMO_ENV);
    expect(enforceRateLimit.mock.calls[0][1].limit).toBe(300);
  });

  it("reports exhaustion instead of throwing", async () => {
    enforceRateLimit.mockImplementation(async () => {
      throw new Error("rate limited");
    });
    await expect(consumeDemoAiDailyBudget(DEMO_ENV)).resolves.toBe(false);
  });

  it("treats a zero limit as AI off", async () => {
    await expect(
      consumeDemoAiDailyBudget({ ...DEMO_ENV, DEMO_AI_DAILY_REQUEST_LIMIT: "0" }),
    ).resolves.toBe(false);
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });
});

describe("demo tool policy", () => {
  it("strips blocked tools only in demo mode", () => {
    const tools = { listCandidates: 1, sendCandidateEmail: 2, applyAutomationProposal: 3, bulkScoreJob: 4 };
    expect(Object.keys(withoutDemoBlockedTools(tools, true))).toEqual(["listCandidates"]);
    expect(withoutDemoBlockedTools(tools, false)).toBe(tools);
  });

  it("blocks write tools by name only in demo mode", () => {
    expect(isDemoBlockedAgentTool("sendCandidateEmail", true)).toBe(true);
    expect(isDemoBlockedAgentTool("moveCandidateStage", true)).toBe(false);
    expect(isDemoBlockedAgentTool("sendCandidateEmail", false)).toBe(false);
  });

  it("covers every automation write tool", () => {
    for (const name of AGENT_WRITE_TOOLS.filter((tool) => /Automation/.test(tool))) {
      expect(DEMO_BLOCKED_AGENT_TOOLS.has(name)).toBe(true);
    }
  });

  it("appends the demo note only in demo mode", () => {
    expect(withDemoSystemNote("base", false)).toBe("base");
    expect(withDemoSystemNote("base", true)).toMatch(/^base\n\n## Public demo/);
  });
});
