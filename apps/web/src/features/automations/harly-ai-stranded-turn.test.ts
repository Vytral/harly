import { describe, expect, it } from "vitest";

import {
  nextStepAfterAutomationSimulation,
  shouldReuseProposalSimulation,
  type AutomationProposalSimulation,
} from "@/features/automations/ai-proposals";
import {
  chatErrorMessage,
  isStrandedAssistantTurn,
} from "@/components/dashboard/HarlyAIPanel";

function simulation(
  overrides: Partial<AutomationProposalSimulation> = {},
): AutomationProposalSimulation {
  return {
    scenarios: [],
    allNodeIds: ["trigger", "end"],
    coveredNodeIds: ["trigger", "end"],
    uncoveredNodeIds: [],
    coveragePercent: 100,
    simulationHash: "a".repeat(64),
    status: "verified",
    nodeCoverageLevels: {},
    triggerContext: {},
    conditionContext: null,
    graphHash: "b".repeat(64),
    simulatedAt: "2026-09-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("shouldReuseProposalSimulation", () => {
  it("reuses a passing report for the same graph", () => {
    const existing = simulation();
    expect(
      shouldReuseProposalSimulation(existing, existing.graphHash, false),
    ).toBe(true);
  });

  it("reuses a partial report (apply accepts partial with a warning)", () => {
    const existing = simulation({ status: "partial" });
    expect(
      shouldReuseProposalSimulation(existing, existing.graphHash, false),
    ).toBe(true);
  });

  it("does not reuse when force is set", () => {
    const existing = simulation();
    expect(
      shouldReuseProposalSimulation(existing, existing.graphHash, true),
    ).toBe(false);
  });

  it("does not reuse when there is no prior report", () => {
    expect(shouldReuseProposalSimulation(null, "b".repeat(64), false)).toBe(
      false,
    );
  });

  it("does not reuse when the graph changed since the report", () => {
    const existing = simulation();
    expect(
      shouldReuseProposalSimulation(existing, "c".repeat(64), false),
    ).toBe(false);
  });

  it("does not reuse a failed report", () => {
    const existing = simulation({ status: "failed" });
    expect(
      shouldReuseProposalSimulation(existing, existing.graphHash, false),
    ).toBe(false);
  });
});

describe("nextStepAfterAutomationSimulation", () => {
  it("pushes apply immediately after a fresh successful simulation", () => {
    const step = nextStepAfterAutomationSimulation({
      status: "verified",
      reused: false,
    });
    expect(step).toContain("applyAutomationProposal");
    expect(step).toContain("Do not run another simulation");
  });

  it("pushes apply without re-simulating when the report was reused", () => {
    const step = nextStepAfterAutomationSimulation({
      status: "partial",
      reused: true,
    });
    expect(step).toContain("already exists");
    expect(step).toContain("applyAutomationProposal");
    expect(step).toContain("Do not simulate again");
  });

  it("never tells the model to apply a failed simulation", () => {
    const step = nextStepAfterAutomationSimulation({ status: "failed" });
    expect(step).toContain("force: true");
    expect(step).toContain("Never call applyAutomationProposal");
  });
});

describe("isStrandedAssistantTurn", () => {
  it("flags a finished turn with tools but no text and no write card", () => {
    expect(
      isStrandedAssistantTurn({
        isBusy: false,
        text: "   ",
        writeCardCount: 0,
        toolExecutionCount: 9,
      }),
    ).toBe(true);
  });

  it("does not flag a turn that produced prose", () => {
    expect(
      isStrandedAssistantTurn({
        isBusy: false,
        text: "Here is the plan.",
        writeCardCount: 0,
        toolExecutionCount: 9,
      }),
    ).toBe(false);
  });

  it("does not flag a turn that produced a write confirmation card", () => {
    expect(
      isStrandedAssistantTurn({
        isBusy: false,
        text: "",
        writeCardCount: 1,
        toolExecutionCount: 9,
      }),
    ).toBe(false);
  });

  it("does not flag a busy turn", () => {
    expect(
      isStrandedAssistantTurn({
        isBusy: true,
        text: "",
        writeCardCount: 0,
        toolExecutionCount: 3,
      }),
    ).toBe(false);
  });

  it("does not flag an empty assistant message with no tool work", () => {
    expect(
      isStrandedAssistantTurn({
        isBusy: false,
        text: "",
        writeCardCount: 0,
        toolExecutionCount: 0,
      }),
    ).toBe(false);
  });
});

describe("chatErrorMessage", () => {
  it("uses Error.message", () => {
    expect(chatErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("uses a non-empty string as-is", () => {
    expect(chatErrorMessage(" provider down ")).toBe("provider down");
  });

  it("falls back to a friendly default for unknown values", () => {
    expect(chatErrorMessage({})).toContain("temporarily unavailable");
    expect(chatErrorMessage(undefined)).toBeNull();
    expect(chatErrorMessage("")).toBeNull();
  });
});
