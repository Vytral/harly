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
      productKnowledge:
        "Canonical Harly identity: self-hostable ATS. LinkedIn native jobs are unsupported.",
    });

    expect(prompt).toContain("connectedIntegrations");
    expect(prompt).toContain("resolveJob");
    expect(prompt).toContain("needs_reconnect");
    expect(prompt).toContain("repair link");
    expect(prompt).toContain("candidateNextAction");
    expect(prompt).toContain("one active application");
    expect(prompt).toContain("explicit meeting link");
    expect(prompt).toContain("client-supplied message history");
    expect(prompt).toContain("this candidate");
    expect(prompt).toContain("candidate-123");
    expect(prompt).toContain("recentAgentActions");
    expect(prompt).toContain("undoAgentAction");
    expect(prompt).toContain("deshaz lo último");
    expect(prompt).toContain("Reply in the same language");
    expect(prompt).toContain("hiringBrief");
    expect(prompt).toContain("workspaceCapabilities");
    expect(prompt).toContain("jobDistributionOptions");
    expect(prompt).toContain("observedAt");
    expect(prompt).toContain("native job on an external platform");
    expect(prompt).toContain("reviewCandidate");
    expect(prompt).toContain("Canonical Harly identity: self-hostable ATS");
    expect(prompt).toContain("Canonical Harly product knowledge");
    expect(prompt).not.toContain(
      "You have NO access to Settings , billing, integrations",
    );
  });
});
