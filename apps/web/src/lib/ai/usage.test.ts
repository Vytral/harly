import { describe, expect, it, vi } from "vitest";

vi.mock("@harly/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        catch: () => {},
      }),
    }),
  },
}));

import { getRecentAiUsage, recordAiUsage } from "./usage";

describe("recordAiUsage (IA-04)", () => {
  it("records usage events and returns them most-recent-first", () => {
    recordAiUsage({
      surface: "score",
      provider: "openai",
      modelId: "gpt-4o",
      workspaceId: "ws-1",
      promptTokens: 10,
      completionTokens: 5,
    });
    recordAiUsage({
      surface: "chat",
      provider: "anthropic",
      modelId: "claude",
      promptTokens: 20,
      completionTokens: 8,
    });

    const recent = getRecentAiUsage(10);
    expect(recent.length).toBeGreaterThanOrEqual(2);
    expect(recent[0]?.surface).toBe("chat");
    expect(recent[0]?.promptTokens).toBe(20);
  });
});
