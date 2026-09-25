import { describe, expect, it } from "vitest";
import { compileGraph } from "./compile";
import { legacyToGraph } from "./legacy-adapter";
import { validateGraph } from "./validate";

describe("compiler trust boundaries", () => {
  it.each(["constructor", "toString", "valueOf"])("indexes %s without touching inherited objects", (id) => {
    const original = Reflect.get(Object, "next");
    const graph = legacyToGraph({ trigger: { event: "application.created" }, conditions: [], actions: [] });
    graph.entryNodeId = id;
    graph.nodes[0]!.id = id;
    graph.edges[0]!.source = id;
    const compiled = compileGraph(graph);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error("Expected valid graph");
    expect(compiled.plan.ports[id]?.next).toBe("end_completed");
    expect(Object.getPrototypeOf(compiled.plan.ports)).toBeNull();
    expect(Reflect.get(Object, "next")).toBe(original);
  });
  it("rejects circular input without crashing the caller", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(validateGraph(circular)).toMatchObject([{ fieldPath: "graph", message: "Graph must be serializable JSON." }]);
  });
  it("counts UTF-8 bytes rather than UTF-16 character units", () => {
    expect(validateGraph({ text: "界".repeat(360000) })[0]?.message).toContain("1 MiB");
  });
  it("rejects missing producers in wait resource bindings", () => {
    const graph = legacyToGraph({ trigger: { event: "application.created" }, conditions: [], actions: [] });
    graph.nodes.push({ id: "wait", type: "wait", kind: "event", resourceId: { kind: "output", nodeId: "missing", path: "id" } });
    expect(validateGraph(graph).some((issue) => issue.nodeId === "wait" && issue.fieldPath === "resourceId" && issue.message.includes("missing"))).toBe(true);
  });
  it("rejects self-referential wait bindings", () => {
    const graph = legacyToGraph({ trigger: { event: "application.created" }, conditions: [], actions: [] });
    graph.nodes.push({ id: "wait", type: "wait", kind: "event", resourceId: { kind: "output", nodeId: "wait", path: "id" } });
    expect(validateGraph(graph).some((issue) => issue.fieldPath === "resourceId" && issue.message.includes("guaranteed"))).toBe(true);
  });
});
