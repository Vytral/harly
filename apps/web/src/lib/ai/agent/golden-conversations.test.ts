import { describe, expect, it } from "vitest";

import { buildHarlySystemPrompt } from "./system-prompt";
import { HARLY_GOLDEN_CONVERSATIONS } from "./golden-conversations";
import { classifyHarlyIntent } from "./intent";
import { buildHarlyTools } from "./index";
import { resolveActiveToolGroups } from "./tool-routing";

describe("Harly golden behavior set", () => {
  it("has unique cases with explicit tool and truthfulness contracts", () => {
    const ids = HARLY_GOLDEN_CONVERSATIONS.map(
      (conversation) => conversation.id,
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(HARLY_GOLDEN_CONVERSATIONS.length).toBeGreaterThanOrEqual(50);
    expect(
      new Set(
        HARLY_GOLDEN_CONVERSATIONS.map((conversation) => conversation.category),
      ),
    ).toEqual(
      new Set([
        "workspace_fact",
        "capability",
        "distribution",
        "integration",
        "candidate_review",
        "automation_build",
        "product_docs",
        "general_advice",
      ]),
    );
    for (const conversation of HARLY_GOLDEN_CONVERSATIONS) {
      expect(conversation.userMessage.length).toBeGreaterThan(10);
      expect(conversation.responseMustInclude.length).toBeGreaterThan(0);
      expect(conversation.forbiddenClaims.length).toBeGreaterThan(0);
    }
  });

  it("keeps the system contract aligned with the workspace-grounded cases", () => {
    const prompt = buildHarlySystemPrompt({
      workspaceName: "Vytral",
      userName: "Maximiliano",
      role: "owner",
      today: "2026-07-31",
    });

    const toolNames = new Set(
      HARLY_GOLDEN_CONVERSATIONS.flatMap(
        (conversation) => conversation.requiredToolSequence,
      ),
    );
    for (const toolName of toolNames) {
      expect(prompt).toContain(toolName);
    }
    expect(prompt).toContain("source");
    expect(prompt).toContain("general recruiting knowledge");
    expect(prompt).toContain("final hiring decision");
  });

  it("keeps every automation golden case routable and exposed to the agent", () => {
    const automationCases = HARLY_GOLDEN_CONVERSATIONS.filter(
      (conversation) => conversation.category === "automation_build",
    );
    expect(automationCases.length).toBeGreaterThanOrEqual(5);

    const tools = buildHarlyTools({
      workspaceId: "golden-workspace",
      userId: "golden-user",
      permissions: ["automations:manage"],
    });
    const availableTools = new Set(Object.keys(tools));

    for (const conversation of automationCases) {
      const groups = resolveActiveToolGroups({
        message: conversation.userMessage,
        intent: classifyHarlyIntent(conversation.userMessage),
      });
      expect(groups.has("automations"), conversation.id).toBe(true);
      for (const toolName of conversation.requiredToolSequence) {
        expect(availableTools.has(toolName), `${conversation.id}: ${toolName}`).toBe(true);
      }
    }
  });
});
