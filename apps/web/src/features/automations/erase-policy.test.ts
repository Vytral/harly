import { describe, expect, it } from "vitest";

import type { WorkflowGraphV2 } from "./definition/schema-v2";
import {
  eraseExecutionMode,
  hasUnguardedPathToErase,
  listAutomaticEraseNodeIds,
  validateEraseCandidatePublishRules,
} from "./erase-policy";

function graph(partial: Partial<WorkflowGraphV2> & Pick<WorkflowGraphV2, "nodes" | "edges">): WorkflowGraphV2 {
  return {
    schemaVersion: 2,
    entryNodeId: partial.entryNodeId ?? "trigger",
    nodes: partial.nodes,
    edges: partial.edges,
  };
}

describe("erase-policy", () => {
  it("defaults executionMode to require_approval", () => {
    expect(eraseExecutionMode({})).toBe("require_approval");
    expect(
      eraseExecutionMode({
        executionMode: { kind: "literal", value: "automatic" },
      }),
    ).toBe("automatic");
  });

  it("rejects erase without an approval on every path", () => {
    const g = graph({
      nodes: [
        { id: "trigger", type: "trigger", event: "application.rejected" },
        {
          id: "erase",
          type: "action",
          actionType: "erase_candidate_data",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {},
        },
        { id: "done", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "erase" },
        { id: "e2", source: "erase", port: "success", target: "done" },
      ],
    });
    expect(hasUnguardedPathToErase(g, "erase")).toBe(true);
    const issues = validateEraseCandidatePublishRules(g);
    expect(issues.some((i) => i.nodeId === "erase")).toBe(true);
  });

  it("accepts erase when every path passes through approval", () => {
    const g = graph({
      nodes: [
        { id: "trigger", type: "trigger", event: "application.rejected" },
        {
          id: "approve",
          type: "approval",
          eligibleActorIds: ["user-1"],
          rule: "any",
          deadlineHours: 24,
        },
        {
          id: "erase",
          type: "action",
          actionType: "erase_candidate_data",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {},
        },
        { id: "done", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "approve" },
        { id: "e2", source: "approve", port: "approved", target: "erase" },
        { id: "e3", source: "erase", port: "success", target: "done" },
      ],
    });
    expect(hasUnguardedPathToErase(g, "erase")).toBe(false);
    expect(validateEraseCandidatePublishRules(g)).toEqual([]);
  });

  it("allows automatic mode structurally and lists those nodes", () => {
    const g = graph({
      nodes: [
        { id: "trigger", type: "trigger", event: "application.rejected" },
        {
          id: "erase",
          type: "action",
          actionType: "erase_candidate_data",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {
            executionMode: { kind: "literal", value: "automatic" },
          },
        },
        { id: "done", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "erase" },
        { id: "e2", source: "erase", port: "success", target: "done" },
      ],
    });
    expect(validateEraseCandidatePublishRules(g)).toEqual([]);
    expect(listAutomaticEraseNodeIds(g)).toEqual(["erase"]);
  });

  it("detects a bypass branch that skips approval", () => {
    const g = graph({
      nodes: [
        { id: "trigger", type: "trigger", event: "application.rejected" },
        { id: "condition", type: "condition", tree: [] },
        {
          id: "approve",
          type: "approval",
          eligibleActorIds: ["user-1"],
          rule: "any",
          deadlineHours: 24,
        },
        {
          id: "erase",
          type: "action",
          actionType: "erase_candidate_data",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {},
        },
        { id: "done", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "condition" },
        { id: "e2", source: "condition", port: "true", target: "approve" },
        { id: "e3", source: "approve", port: "approved", target: "erase" },
        { id: "e4", source: "condition", port: "false", target: "erase" },
        { id: "e5", source: "erase", port: "success", target: "done" },
      ],
    });
    expect(hasUnguardedPathToErase(g, "erase")).toBe(true);
  });
});
