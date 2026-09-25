import { describe, expect, it } from "vitest";

import { semanticGraphHash } from "./hash";
import {
  rebaseAutomationPatch,
  selectAutomationSubgraph,
} from "./subgraph";
import type { WorkflowGraphV2 } from "./schema-v2";

const graph: WorkflowGraphV2 = {
  schemaVersion: 2,
  entryNodeId: "trigger",
  nodes: [
    { id: "trigger", type: "trigger", event: "application.created", filter: {} },
    { id: "middle", type: "delay", mode: "duration", durationMs: 1000 },
    { id: "end", type: "end", result: "completed" },
  ],
  edges: [
    { id: "e1", source: "trigger", port: "next", target: "middle" },
    { id: "e2", source: "middle", port: "elapsed", target: "end" },
  ],
};

describe("automation subgraphs", () => {
  it("paginates deterministically and hashes the returned page", () => {
    const first = selectAutomationSubgraph({ graph, limit: 2 });
    expect(first.nodeIds).toEqual(["end", "middle"]);
    expect(first.edges).toEqual([
      { id: "e2", source: "middle", port: "elapsed", target: "end" },
    ]);
    expect(first.nextCursor).toBeTruthy();

    const second = selectAutomationSubgraph({
      graph,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.nodeIds).toEqual(["trigger"]);
    expect(second.nextCursor).toBeNull();
    expect(first.graphHash).toBe(semanticGraphHash(graph));
  });

  it("rebases only when the declared target subgraph is unchanged", () => {
    const base = selectAutomationSubgraph({ graph, nodeIds: ["middle"] });
    const patch = {
      version: 1 as const,
      baseRevision: 1,
      baseContentHash: semanticGraphHash(graph),
      baseSubgraphHash: base.subgraphHash,
      baseNodeIds: ["middle"],
      operations: [
        {
          op: "configureNode" as const,
          nodeId: "middle",
          patch: { durationMs: 2000 },
        },
      ],
    };

    expect(
      rebaseAutomationPatch({
        patch,
        currentGraph: {
          ...graph,
          nodes: graph.nodes.map((node) =>
            node.id === "middle"
              ? { ...node, durationMs: 1500 }
              : node,
          ),
        },
        currentRevision: 2,
        currentContentHash: "b".repeat(64),
      }),
    ).toMatchObject({ ok: false, reason: "subgraph_conflict" });

    const changedElsewhere: WorkflowGraphV2 = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === "end" ? { ...node, result: "stopped" as const } : node,
      ),
    };
    const rebased = rebaseAutomationPatch({
      patch,
      currentGraph: changedElsewhere,
      currentRevision: 2,
      currentContentHash: "b".repeat(64),
    });
    expect(rebased.ok).toBe(true);
    if (rebased.ok) {
      expect(rebased.patch.baseRevision).toBe(2);
      expect(rebased.patch.baseSubgraphHash).toBe(base.subgraphHash);
    }
  });

  it("expands nodeIds by depth neighborhood", () => {
    const oneHop = selectAutomationSubgraph({
      graph,
      nodeIds: ["middle"],
      depth: 1,
    });
    expect(oneHop.nodeIds).toEqual(["end", "middle", "trigger"]);
    const zeroHop = selectAutomationSubgraph({
      graph,
      nodeIds: ["middle"],
      depth: 0,
    });
    expect(zeroHop.nodeIds).toEqual(["middle"]);
  });

  it("accepts baseGraphHash as an alias of baseContentHash", () => {
    const base = selectAutomationSubgraph({ graph, nodeIds: ["middle"] });
    const patch = {
      version: 1 as const,
      baseRevision: 1,
      baseGraphHash: semanticGraphHash(graph),
      baseSubgraphHash: base.subgraphHash,
      baseNodeIds: ["middle"],
      operations: [
        {
          op: "configureNode" as const,
          nodeId: "middle",
          patch: { durationMs: 2000 },
        },
      ],
    };
    const rebased = rebaseAutomationPatch({
      patch,
      currentGraph: graph,
      currentRevision: 1,
      currentContentHash: semanticGraphHash(graph),
    });
    expect(rebased.ok).toBe(true);
  });
});
