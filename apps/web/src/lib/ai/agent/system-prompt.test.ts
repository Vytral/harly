import { describe, expect, it } from "vitest";

import { buildHarlySystemPrompt } from "./system-prompt";

describe("Harly AI system prompt", () => {
  it("teaches the agent to resolve obvious application context and integrations", () => {
    const prompt = buildHarlySystemPrompt({
      workspaceName: "Syntrix",
      userName: "Maximiliano",
      role: "recruiter",
      today: "Sunday, July 19, 2026",
      activeCandidateId: "candidate-123",
    });

    expect(prompt).toContain("connectedIntegrations");
    expect(prompt).toContain("nextCandidateStage");
    expect(prompt).toContain("one active application");
    expect(prompt).toContain("explicit meeting link");
    expect(prompt).toContain("client-supplied message history");
    expect(prompt).toContain("this candidate");
    expect(prompt).toContain("candidate-123");
    expect(prompt).toContain("recentAgentActions");
    expect(prompt).toContain("undoAgentAction");
    expect(prompt).toContain("deshaz lo último");
    expect(prompt).not.toContain("You have NO access to Settings , billing, integrations");
  });
});
