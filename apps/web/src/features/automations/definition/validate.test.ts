import { describe, expect, it } from "vitest";

import { compileGraph } from "./compile";
import { GRAPH_SCHEMA_VERSION } from "./limits";
import { graphToLegacy, legacyToGraph } from "./legacy-adapter";
import type { WorkflowGraphV2 } from "./schema-v2";
import { validateGraph } from "./validate";

const linear = legacyToGraph({
  trigger: { event: "application.stage_changed", filter: { jobId: "job-1" } },
  conditions: [],
  actions: [
    { type: "add_tag", config: { label: "vip" }, continueOnError: false },
    { type: "create_task", config: { title: "Welcome" }, continueOnError: true },
  ],
});

describe("T05 — graph validation", () => {
  it("accepts a linear legacy graph", () => {
    expect(validateGraph(linear)).toEqual([]);
    expect(compileGraph(linear).ok).toBe(true);
  });

  it("rejects duplicate ids", () => {
    const graph: WorkflowGraphV2 = {
      ...linear,
      nodes: [...linear.nodes, { ...linear.nodes[0]!, id: "trigger" }],
    };
    expect(validateGraph(graph).some((issue) => issue.message.includes("Duplicate"))).toBe(true);
  });

  it("rejects a cycle", () => {
    const graph: WorkflowGraphV2 = {
      ...linear,
      edges: [
        ...linear.edges,
        { id: "loop", source: "end_completed", port: "next", target: "trigger" },
      ],
    };
    const issues = validateGraph(graph);
    expect(issues.some((issue) => /cycle/i.test(issue.message) || /trigger/i.test(issue.message))).toBe(
      true,
    );
  });

  it("rejects an unreachable node", () => {
    const graph: WorkflowGraphV2 = {
      ...linear,
      nodes: [...linear.nodes, { id: "orphan", type: "end", result: "stopped" }],
    };
    expect(validateGraph(graph).some((issue) => issue.nodeId === "orphan")).toBe(true);
  });

  it("rejects two destinations on the same port", () => {
    const graph: WorkflowGraphV2 = {
      ...linear,
      edges: [
        ...linear.edges,
        { id: "dup", source: "trigger", port: "next", target: "end_completed" },
      ],
    };
    expect(validateGraph(graph).some((issue) => issue.fieldPath.includes("ports.next"))).toBe(true);
  });

  it("rejects an output binding from a branch that does not dominate", () => {
    const graph: WorkflowGraphV2 = {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "application.created" },
        {
          id: "condition",
          type: "condition",
          tree: [
            {
              type: "leaf",
              field: { kind: "application", path: "source" },
              op: "eq",
              value: "ref",
            },
          ],
        },
        {
          id: "false_action",
          type: "action",
          actionType: "add_note",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { body: { kind: "literal", value: "no" } },
        },
        {
          id: "true_action",
          type: "action",
          actionType: "add_note",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {
            body: { kind: "output", nodeId: "false_action", path: "noteId" },
          },
        },
        { id: "end_completed", type: "end", result: "completed" },
        { id: "end_stopped", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "condition" },
        { id: "e2", source: "condition", port: "true", target: "true_action" },
        { id: "e3", source: "condition", port: "false", target: "false_action" },
        { id: "e4", source: "true_action", port: "success", target: "end_completed" },
        { id: "e5", source: "false_action", port: "success", target: "end_stopped" },
      ],
    };
    expect(
      validateGraph(graph).some((issue) => issue.message.includes("not guaranteed")),
    ).toBe(true);
  });

  it("rejects waits that the runtime cannot schedule or resume", () => {
    const delayGraph: WorkflowGraphV2 = {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "application.created" },
        { id: "delay", type: "delay", mode: "duration" },
        { id: "end", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "delay" },
        { id: "e2", source: "delay", port: "elapsed", target: "end" },
      ],
    };
    expect(validateGraph(delayGraph).some((item) => item.fieldPath === "durationMs")).toBe(true);

    const localGraph = {
      ...delayGraph,
      nodes: delayGraph.nodes.map((node) =>
        node.id === "delay"
          ? { id: "delay", type: "delay" as const, mode: "next_local" as const, localTime: "25:00", timeZone: "Not/AZone" }
          : node,
      ),
    } satisfies WorkflowGraphV2;
    const localIssues = validateGraph(localGraph);
    expect(localIssues.some((item) => item.fieldPath === "localTime")).toBe(true);
    expect(localIssues.some((item) => item.fieldPath === "timeZone")).toBe(true);

    const eventGraph = {
      ...delayGraph,
      nodes: delayGraph.nodes.map((node) =>
        node.id === "delay"
          ? { id: "delay", type: "wait" as const, kind: "event" as const, eventName: "provider.callback" }
          : node,
      ),
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "delay" },
        { id: "e2", source: "delay", port: "matched", target: "end" },
        { id: "e3", source: "delay", port: "expired", target: "end" },
      ],
    } satisfies WorkflowGraphV2;
    expect(validateGraph(eventGraph).some((item) => item.fieldPath === "eventName")).toBe(true);
  });
});

describe("T22 — legacy adapter roundtrip", () => {
  it("preserves trigger, conditions, actions, and continueOnError", () => {
    const recipe = {
      trigger: { event: "application.created" as const, filter: { jobId: "job-9" } },
      conditions: [
        {
          type: "leaf" as const,
          field: { kind: "candidate" as const, path: "source" },
          op: "eq" as const,
          value: "linkedin",
        },
      ],
      actions: [
        { type: "move_stage" as const, config: { toStageName: "Offer" }, continueOnError: false },
        { type: "add_tag" as const, config: { label: "onboarding" }, continueOnError: true },
      ],
    };
    const back = graphToLegacy(legacyToGraph(recipe));
    expect(back.trigger).toEqual(recipe.trigger);
    expect(back.conditions).toEqual(recipe.conditions);
    expect(back.actions[0]).toMatchObject({ type: "move_stage", config: { toStageName: "Offer" } });
    expect(back.actions[1]?.continueOnError).toBe(true);
    expect(validateGraph(legacyToGraph(recipe))).toEqual([]);
  });

  it("maps an empty action list to trigger → end", () => {
    const graph = legacyToGraph({
      trigger: { event: "job.published" },
      conditions: [],
      actions: [],
    });
    expect(graphToLegacy(graph).actions).toEqual([]);
    expect(validateGraph(graph)).toEqual([]);
  });
});
