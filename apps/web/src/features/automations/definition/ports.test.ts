import { describe, expect, it } from "vitest";
import { compileGraph } from "./compile";
import { outputPorts } from "./ports";
import type { WorkflowGraphV2, WorkflowNode } from "./schema-v2";

describe("wait port contract", () => {
  it.each(["event", "document_package"] as const)("compiles every outcome of a %s wait", (kind) => {
    const wait: WorkflowNode = kind === "event"
      ? { id: "wait", type: "wait", kind, eventName: "application.created" }
      : { id: "wait", type: "wait", kind, resourceId: { kind: "literal", value: "application-id" } };
    const ports = outputPorts(wait);
    const graph: WorkflowGraphV2 = {
      schemaVersion: 2, entryNodeId: "trigger",
      nodes: [{ id: "trigger", type: "trigger", event: "application.created" }, wait, { id: "end", type: "end", result: "completed" }],
      edges: [{ id: "start", source: "trigger", port: "next", target: "wait" }, ...ports.map((port) => ({ id: port, source: "wait", port, target: "end" }))],
    };
    expect(compileGraph(graph).ok).toBe(true);
    graph.edges.push({ id: "invalid", source: "wait", port: kind === "event" ? "completed" : "matched", target: "end" });
    expect(compileGraph(graph).ok).toBe(false);
  });
  it("does not offer document-only outcomes on event waits", () => {
    expect(outputPorts({ id: "wait", type: "wait", kind: "event" })).toEqual(["matched", "expired"]);
  });
});
