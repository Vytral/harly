import { describe, expect, it, vi } from "vitest";
import type { WorkflowGraphV2 } from "../definition/schema-v2";
import { simulationFixturesSchema, simulate } from "./simulate";

function graph(): WorkflowGraphV2 {
  return {
    schemaVersion: 2,
    entryNodeId: "trigger",
    nodes: [
      { id: "trigger", type: "trigger", event: "application.created" },
      { id: "condition", type: "condition", tree: [] },
      {
        id: "yes",
        type: "action",
        actionType: "add_note",
        toolVersion: 1,
        failurePolicy: "stop",
        input: { body: { kind: "literal", value: "Yes" } },
      },
      {
        id: "no",
        type: "action",
        actionType: "add_note",
        toolVersion: 1,
        failurePolicy: "continue",
        input: { body: { kind: "literal", value: "No" } },
      },
      { id: "end", type: "end", result: "completed" },
    ],
    edges: [
      { id: "e1", source: "trigger", port: "next", target: "condition" },
      { id: "e2", source: "condition", port: "true", target: "yes" },
      { id: "e3", source: "condition", port: "false", target: "no" },
      { id: "e4", source: "yes", port: "success", target: "end" },
      { id: "e5", source: "no", port: "success", target: "end" },
    ],
  };
}

describe("simulation of compiled workflows", () => {
  it.each([true, false])(
    "follows only the selected exclusive branch (%s)",
    (matched) => {
      const evaluateCondition = vi.fn(() => matched);
      const result = simulate({
        graph: graph(),
        trigger: {},
        fixtures: {
          yes: { status: "succeeded", output: {} },
          no: { status: "succeeded", output: {} },
        },
        evaluateCondition,
      });
      expect(result.type).toBe("finished");
      if (result.type !== "finished") throw new Error(JSON.stringify(result));
      expect(result.result.status).toBe("succeeded");
      expect(
        result.trace.some((row) => row.nodeId === (matched ? "no" : "yes")),
      ).toBe(false);
      expect(evaluateCondition).toHaveBeenCalledTimes(1);
    },
  );
  it("asks for an explicit action fixture instead of inventing success", () => {
    const result = simulate({
      graph: graph(),
      trigger: {},
      fixtures: {},
      evaluateCondition: () => false,
    });
    expect(result).toMatchObject({ type: "needs_fixture", nodeId: "no" });
  });
  it("reports failure with continued warnings honestly", () => {
    const result = simulate({
      graph: graph(),
      trigger: {},
      fixtures: { no: { status: "failed", code: "TIMEOUT" } },
      evaluateCondition: () => false,
    });
    expect(result).toMatchObject({
      type: "finished",
      result: { status: "completed_with_warnings" },
      snapshot: { warnings: ["no"] },
    });
  });
  it("does not continue on uncertain external results", () => {
    const result = simulate({
      graph: graph(),
      trigger: {},
      fixtures: { no: { status: "uncertain", code: "TIMEOUT" } },
      evaluateCondition: () => false,
    });
    expect(result).toMatchObject({
      type: "finished",
      result: { status: "uncertain" },
    });
  });
  it("validates the graph before consuming any fixtures", () => {
    const evaluateCondition = vi.fn(() => true);
    expect(
      simulate({ graph: {}, trigger: {}, fixtures: {}, evaluateCondition })
        .type,
    ).toBe("invalid");
    expect(evaluateCondition).not.toHaveBeenCalled();
  });
  it("rejects server-reported action schema issues before a success fixture can mask them", () => {
    const evaluateCondition = vi.fn(() => true);
    const result = simulate({
      graph: graph(),
      trigger: {},
      fixtures: { yes: { status: "succeeded", output: {} } },
      preflightIssues: [
        {
          nodeId: "yes",
          fieldPath: "input.body",
          message: "Fill in note text.",
        },
      ],
      evaluateCondition,
    });

    expect(result).toMatchObject({
      type: "invalid",
      issues: [{ nodeId: "yes", fieldPath: "input.body" }],
    });
    expect(evaluateCondition).not.toHaveBeenCalled();
  });
  it("accepts JSON provider results and rejects non-JSON outcomes", () => {
    expect(
      simulationFixturesSchema.parse({
        send: {
          status: "succeeded",
          output: { provider: "demo", accepted: true },
          port: "success",
          providerRef: "demo:1",
        },
        wait: { status: "failed", code: "TIMEOUT", retryable: true },
      }),
    ).toMatchObject({
      send: { status: "succeeded" },
      wait: { retryable: true },
    });
    expect(() =>
      simulationFixturesSchema.parse({
        send: { status: "succeeded", output: undefined },
      }),
    ).toThrow();
    expect(() =>
      simulationFixturesSchema.parse({ send: { status: "failed", code: "" } }),
    ).toThrow();
  });
  it("advances a deterministic virtual clock across duration waits", () => {
    const result = simulate({
      graph: {
        schemaVersion: 2,
        entryNodeId: "trigger",
        nodes: [
          { id: "trigger", type: "trigger", event: "application.created" },
          {
            id: "delay",
            type: "delay",
            mode: "duration",
            durationMs: 24 * 60 * 60 * 1000,
          },
          { id: "end", type: "end", result: "completed" },
        ],
        edges: [
          { id: "e1", source: "trigger", port: "next", target: "delay" },
          { id: "e2", source: "delay", port: "elapsed", target: "end" },
        ],
      },
      trigger: { occurredAt: "2099-01-01T00:00:00.000Z" },
      fixtures: { delay: { status: "succeeded", output: {}, port: "elapsed" } },
      evaluateCondition: () => true,
    });

    expect(result.type).toBe("finished");
    if (result.type !== "finished") throw new Error(JSON.stringify(result));
    expect(result.trace.find((row) => row.nodeId === "delay")).toMatchObject({
      virtualTime: "2099-01-01T00:00:00.000Z",
      waitedMs: 24 * 60 * 60 * 1000,
    });
    expect(result.trace.find((row) => row.nodeId === "end")?.virtualTime).toBe(
      "2099-01-02T00:00:00.000Z",
    );
  });

  it("applies supported fixture effects before evaluating the next condition", () => {
    const workflow: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "application.created" },
        {
          id: "tag",
          type: "action",
          actionType: "add_tag",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { label: { kind: "literal", value: "vip" } },
        },
        { id: "condition", type: "condition", tree: [] },
        { id: "yes", type: "end", result: "completed" },
        { id: "no", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "tag" },
        { id: "e2", source: "tag", port: "success", target: "condition" },
        { id: "e3", source: "condition", port: "true", target: "yes" },
        { id: "e4", source: "condition", port: "false", target: "no" },
      ],
    };
    const state = { tags: [] as string[] };
    const result = simulate({
      graph: workflow,
      trigger: {},
      fixtures: { tag: { status: "succeeded", output: {} } },
      virtualState: state,
      applyVirtualAction: (_node, input, _outcome, virtualState) => {
        const tag = input.label;
        if (typeof tag === "string") {
          (virtualState as typeof state).tags.push(tag);
        }
      },
      evaluateCondition: (_tree, virtualState) =>
        (virtualState as typeof state).tags.includes("vip"),
    });

    expect(result).toMatchObject({
      type: "finished",
      result: { status: "succeeded" },
    });
    expect(state.tags).toEqual(["vip"]);
  });

  it("rejects a successful action fixture whose output breaks the tool contract", () => {
    const result = simulate({
      graph: {
        schemaVersion: 2,
        entryNodeId: "trigger",
        nodes: [
          { id: "trigger", type: "trigger", event: "application.created" },
          {
            id: "tag",
            type: "action",
            actionType: "add_tag",
            toolVersion: 1,
            failurePolicy: "stop",
            input: { label: { kind: "literal", value: "vip" } },
          },
          { id: "end", type: "end", result: "completed" },
        ],
        edges: [
          { id: "e1", source: "trigger", port: "next", target: "tag" },
          { id: "e2", source: "tag", port: "success", target: "end" },
        ],
      },
      trigger: {},
      fixtures: { tag: { status: "succeeded", output: {} } },
      evaluateCondition: () => true,
      validateFixtureOutput: () => [{
        nodeId: "tag",
        fieldPath: "fixture.output",
        message: "Expected a documented action output.",
      }],
    });
    expect(result).toMatchObject({
      type: "invalid",
      issues: [{ nodeId: "tag", fieldPath: "fixture.output" }],
    });
  });
});
