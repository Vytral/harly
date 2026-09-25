import { describe, expect, it } from "vitest";

import { semanticGraphHash } from "@/features/automations/definition/hash";
import type { WorkflowGraphV2 } from "@/features/automations/definition/schema-v2";

import { resolveVerifiedLocalGraph, type HarlyToolContext } from "./tools";

/**
 * D5: the model must reason about the user's actual unsaved editor state
 * instead of silently falling back to the last-saved server revision. These
 * tests cover `resolveVerifiedLocalGraph`, the guard that decides whether the
 * local graph sent in `activeAutomation` is safe to hand to the model.
 */
describe("resolveVerifiedLocalGraph (D5)", () => {
  const workflowId = "11111111-1111-4111-8111-111111111111";
  const graph: WorkflowGraphV2 = {
    schemaVersion: 2,
    entryNodeId: "trigger_node",
    nodes: [{ id: "trigger_node", type: "trigger", event: "application.created", filter: {} }],
    edges: [],
  };
  const baseCtx: HarlyToolContext = {
    workspaceId: "ws-1",
    userId: "user-1",
  };

  it("returns null when there is no active automation at all", () => {
    expect(resolveVerifiedLocalGraph(baseCtx, workflowId)).toBeNull();
  });

  it("returns null when the active automation is a different workflow", () => {
    const ctx: HarlyToolContext = {
      ...baseCtx,
      activeAutomation: {
        workflowId: "22222222-2222-4222-8222-222222222222",
        isUnsaved: true,
        contentHash: semanticGraphHash(graph),
        graph,
      },
    };
    expect(resolveVerifiedLocalGraph(ctx, workflowId)).toBeNull();
  });

  it("returns null when the client did not report unsaved edits", () => {
    const ctx: HarlyToolContext = {
      ...baseCtx,
      activeAutomation: {
        workflowId,
        isUnsaved: false,
        contentHash: semanticGraphHash(graph),
        graph,
      },
    };
    expect(resolveVerifiedLocalGraph(ctx, workflowId)).toBeNull();
  });

  it("returns null when no graph snapshot was sent", () => {
    const ctx: HarlyToolContext = {
      ...baseCtx,
      activeAutomation: {
        workflowId,
        isUnsaved: true,
        contentHash: semanticGraphHash(graph),
      },
    };
    expect(resolveVerifiedLocalGraph(ctx, workflowId)).toBeNull();
  });

  it("returns null when the graph fails to parse as a valid WorkflowGraphV2", () => {
    const ctx: HarlyToolContext = {
      ...baseCtx,
      activeAutomation: {
        workflowId,
        isUnsaved: true,
        contentHash: "0".repeat(64),
        graph: { not: "a valid graph" },
      },
    };
    expect(resolveVerifiedLocalGraph(ctx, workflowId)).toBeNull();
  });

  it("returns null when the claimed contentHash does not match the actual graph (never trust the client's claim)", () => {
    const ctx: HarlyToolContext = {
      ...baseCtx,
      activeAutomation: {
        workflowId,
        isUnsaved: true,
        contentHash: "a".repeat(64), // wrong on purpose
        graph,
      },
    };
    expect(resolveVerifiedLocalGraph(ctx, workflowId)).toBeNull();
  });

  it("returns the verified local graph when everything lines up", () => {
    const contentHash = semanticGraphHash(graph);
    const ctx: HarlyToolContext = {
      ...baseCtx,
      activeAutomation: {
        workflowId,
        isUnsaved: true,
        contentHash,
        graph,
      },
    };
    const result = resolveVerifiedLocalGraph(ctx, workflowId);
    expect(result).not.toBeNull();
    expect(result?.contentHash).toBe(contentHash);
    expect(result?.graph.nodes).toHaveLength(1);
    expect(result?.graph.nodes[0]!.id).toBe("trigger_node");
  });

  it("detects a stale hash after the local graph changed without the client updating contentHash", () => {
    const staleHash = semanticGraphHash(graph);
    const editedGraph: WorkflowGraphV2 = {
      ...graph,
      nodes: [
        ...graph.nodes,
        { id: "action_node", type: "action", actionType: "add_tag", toolVersion: 1, failurePolicy: "stop", input: { label: { kind: "literal", value: "x" } } },
      ],
    };
    const ctx: HarlyToolContext = {
      ...baseCtx,
      activeAutomation: {
        workflowId,
        isUnsaved: true,
        contentHash: staleHash, // still the hash of the OLD graph
        graph: editedGraph, // but the graph sent is the NEW one
      },
    };
    expect(resolveVerifiedLocalGraph(ctx, workflowId)).toBeNull();
  });
});
