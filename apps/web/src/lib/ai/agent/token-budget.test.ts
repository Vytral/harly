import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import { getHarlyProductBrief } from "@/lib/ai/knowledge/harly-product-knowledge";

import { compactHistoryForModel, compactToolOutput } from "./context-budget";
import { classifyHarlyIntent } from "./intent";
import { buildHarlySystemPromptParts } from "./system-prompt";
import {
  buildPromptTokenBreakdown,
  measureToolDefinitions,
  systemPromptSections,
} from "./token-debug";
import { resolveActiveToolGroups, selectActiveToolNames, turnNeedsWriteTools } from "./tool-routing";
import { buildWorkspaceKnowledge, workspaceKnowledgeDetailFor } from "./workspace-knowledge";

/**
 * Offline prompt-size budget for the reference turn "Summarize Charlotte
 * Dubois" (resolveCandidate → candidateProfile → reviewCandidate → answer,
 * i.e. four provider calls). Sizes are chars/4 estimates of what the chat
 * route assembles; no provider is called.
 */
const MESSAGE = "Summarize Charlotte Dubois";
const CANDIDATE_ID = "6a5346f8-d3e6-4b2e-9d12-da950cc40274";
const APPLICATION_ID = "0f1c9d1e-6c41-4f0f-8d0c-1a2b3c4d5e6f";
const JOB_ID = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const lorem = (words: number) =>
  Array.from({ length: words }, (_, index) => `evidence${index % 37}`).join(" ");

export const REFERENCE_TOOL_STEPS: Array<{ toolName: string; input: unknown; output: unknown }> = [
  {
    toolName: "resolveCandidate",
    input: { query: "Charlotte Dubois" },
    output: {
      status: "resolved",
      candidate: { candidateId: CANDIDATE_ID, name: "Charlotte Dubois", email: "charlotte@example.com", headline: "Senior Product Designer" },
      alternatives: [],
    },
  },
  {
    toolName: "candidateProfile",
    input: { candidateId: CANDIDATE_ID },
    output: {
      source: "live workspace candidate profile",
      observedAt: "2026-10-31T10:00:00.000Z",
      limitations: [],
      found: true,
      candidateId: CANDIDATE_ID,
      name: "Charlotte Dubois",
      email: "charlotte@example.com",
      headline: "Senior Product Designer",
      location: "Lyon, France",
      applications: [{ applicationId: APPLICATION_ID, jobId: JOB_ID, job: "Product Designer", stage: "Interview", status: "active", isActive: true }],
      tags: ["design-systems", "referral"],
      scorecards: Array.from({ length: 3 }, (_, index) => ({ rating: 4, stage: `Stage ${index}`, comment: lorem(45) })),
      aiEvaluations: [{ applicationId: APPLICATION_ID, score: 82, recommendation: "advance", summary: lorem(60) }],
      recentNotes: Array.from({ length: 5 }, () => ({ author: "Max", body: lorem(45) })),
    },
  },
  {
    toolName: "reviewCandidate",
    input: { candidateId: CANDIDATE_ID, applicationId: APPLICATION_ID, generateScore: false },
    output: {
      source: "live candidate profile, application, and evaluation data",
      reviewed: true,
      found: true,
      candidate: { candidateId: CANDIDATE_ID, name: "Charlotte Dubois", headline: "Senior Product Designer", location: "Lyon, France", tags: ["design-systems"] },
      application: { applicationId: APPLICATION_ID, jobId: JOB_ID, job: "Product Designer", stage: "Interview", status: "active" },
      evidence: [{ fileName: "cv.pdf", summary: lorem(130), skills: Array.from({ length: 15 }, (_, index) => `skill-${index}`), experienceYears: 8 }],
      evaluation: { score: 82, recommendation: "advance", summary: lorem(130), strengths: [lorem(20), lorem(20)], gaps: [lorem(20)], usedResume: true },
      scorecards: Array.from({ length: 3 }, () => ({ rating: 4, stage: "Interview", author: "Max", comment: lorem(70) })),
      notes: Array.from({ length: 5 }, () => ({ author: "Max", body: lorem(70) })),
      missingEvidence: [],
    },
  },
];

/** Model messages for each provider call of the reference turn. */
export function referenceStepMessages(
  history: ModelMessage[],
  mapOutput: (output: unknown) => unknown,
): ModelMessage[][] {
  const steps: ModelMessage[][] = [[...history]];
  let current = [...history];
  REFERENCE_TOOL_STEPS.forEach((step, index) => {
    const toolCallId = `call-${index}`;
    current = [
      ...current,
      { role: "assistant", content: [{ type: "tool-call", toolCallId, toolName: step.toolName, input: step.input }] },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId, toolName: step.toolName, output: { type: "json", value: mapOutput(step.output) as never } }],
      },
    ];
    steps.push(current);
  });
  return steps;
}

export const REFERENCE_WORKSPACE = {
  workspaceName: "Syntrix",
  tagline: "Build useful things",
  description: lorem(120),
  websiteUrl: "https://syntrix.example",
  careerPageConfig: {
    hero: { headline: "Come build with us", subhead: lorem(60) },
    intro: { body: lorem(120) },
    values: { enabled: true, items: Array.from({ length: 6 }, (_, index) => ({ title: `Value ${index}`, body: lorem(40) })) },
    faq: { enabled: true, items: Array.from({ length: 6 }, (_, index) => ({ q: `Question ${index}?`, a: lorem(50) })) },
  },
};

describe("Harly AI prompt token budget", () => {
  it("keeps the reference 'Summarize <candidate>' turn under 25k prompt tokens across all steps", async () => {
    const { buildHarlyTools } = await import("./index");
    const tools = buildHarlyTools({ workspaceId: "ws-1", userId: "user-1" }) as Record<string, unknown>;
    const intent = classifyHarlyIntent(MESSAGE);
    const groups = resolveActiveToolGroups({ message: MESSAGE, intent });
    const active = selectActiveToolNames(Object.keys(tools), groups, { includeWrites: turnNeedsWriteTools({ message: MESSAGE, intent }) });
    expect(active).toBeDefined();
    expect(active).toContain("presentUi");
    expect(active).not.toContain("prepareAutomationPlan");

    const prompt = buildHarlySystemPromptParts({
      workspaceName: "Syntrix",
      userName: "Max",
      role: "owner",
      today: "Saturday, October 31, 2026",
      intent,
      activeGroups: groups,
      productKnowledge: getHarlyProductBrief(),
      workspaceKnowledge: buildWorkspaceKnowledge(
        REFERENCE_WORKSPACE,
        workspaceKnowledgeDetailFor({ message: MESSAGE, activeGroups: groups }),
      ),
    });
    expect(prompt.core).toContain("presentUi");

    const toolSize = await measureToolDefinitions(tools, active);
    const history: ModelMessage[] = [{ role: "user", content: MESSAGE }];
    const steps = referenceStepMessages(history, (output) => compactToolOutput(output));
    const breakdowns = steps.map((messages, step) =>
      buildPromptTokenBreakdown({
        step,
        systemSections: {
          ...systemPromptSections("core", prompt.core),
          ...systemPromptSections("context", prompt.context),
        },
        tools: toolSize,
        messages,
        historyCount: history.length,
      }),
    );
    const total = breakdowns.reduce((sum, breakdown) => sum + breakdown.totalTokens, 0);

    expect(toolSize.count).toBeLessThan(40);
    expect(total).toBeLessThan(25_000);
  }, 120_000);

  it("caps a large read result and abbreviates tool payloads from older turns", () => {
    const big = { items: Array.from({ length: 200 }, (_, index) => ({ id: `id-${index}`, body: lorem(80) })) };
    const compacted = compactToolOutput(big);
    expect(JSON.stringify(compacted).length).toBeLessThanOrEqual(6_000);
    expect(JSON.stringify(compacted)).toContain("id-0");

    const toolPart = (id: string) => ({
      type: "tool-candidateProfile",
      toolCallId: id,
      state: "output-available",
      input: { candidateId: CANDIDATE_ID },
      output: big,
    });
    const turns = Array.from({ length: 10 }, (_, index) => [
      { role: "user", parts: [{ type: "text", text: `question ${index} ${lorem(200)}` }] },
      { role: "assistant", parts: [toolPart(`call-${index}`), { type: "text", text: `answer ${index}` }] },
    ]).flat();

    const compactedHistory = compactHistoryForModel(turns);
    // Newest two turns: untouched.
    expect(compactedHistory.slice(-4)).toEqual(turns.slice(-4));
    // Turns 3..8 from the end: tool payload abbreviated, call kept.
    const middle = compactedHistory[compactedHistory.length - 5] as { parts: Array<{ output?: unknown }> };
    expect(JSON.stringify(middle.parts[0]!.output).length).toBeLessThan(1_000);
    // Oldest turns: text only, clipped.
    const oldest = compactedHistory[1] as { parts: Array<{ type: string }> };
    expect(oldest.parts.every((part) => part.type === "text")).toBe(true);
    expect(JSON.stringify(compactedHistory).length).toBeLessThan(JSON.stringify(turns).length / 3);
  });
});
