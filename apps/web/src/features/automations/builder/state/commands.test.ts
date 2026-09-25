import { describe, expect, it } from "vitest";

import { emptyCanvasGraph, emptyLayout } from "../../definition/schema-v2";
import { validateGraph } from "../../definition/validate";
import { createBlock } from "./blocks";
import {
  addNode,
  appendConnection,
  connectNodes,
  deleteNodes,
  insertOnEdge,
  moveNodes,
  type EditorSnapshot,
} from "./commands";
import { editorReducer, initialEditorState } from "./editor-reducer";

function snap(): EditorSnapshot {
  return { graph: emptyCanvasGraph(), layout: emptyLayout() };
}

describe("T06 — canvas commands change graph or layout, not both unless intended", () => {
  it("moving a node updates layout and leaves connections alone", () => {
    let state = snap();
    const action = createBlock("action");
    state = addNode(state, action, { x: 0, y: 120 });
    const connected = connectNodes(state, { source: "trigger", port: "next", target: action.id });
    expect(connected.ok).toBe(true);
    if (!connected.ok) return;
    const moved = moveNodes(connected.snapshot, { [action.id]: { x: 80, y: 240 } });
    expect(moved.graph.edges).toEqual(connected.snapshot.graph.edges);
    expect(moved.layout.positions[action.id]).toEqual({ x: 80, y: 240 });
  });

  it("inserting on an edge replaces one connection with two", () => {
    let state = snap();
    const first = createBlock("action", { actionType: "add_tag" });
    const inserted = createBlock("condition");
    state = addNode(state, first, { x: 0, y: 160 });
    const linked = connectNodes(state, { source: "trigger", port: "next", target: first.id });
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    const edgeId = linked.snapshot.graph.edges[0]!.id;
    const result = insertOnEdge(linked.snapshot, edgeId, inserted);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.graph.edges.some((edge) => edge.id === edgeId)).toBe(false);
    expect(result.snapshot.graph.edges).toHaveLength(2);
    expect(result.snapshot.graph.edges.map((edge) => `${edge.source}->${edge.target}`).sort()).toEqual(
      [`${inserted.id}->${first.id}`, `trigger->${inserted.id}`].sort(),
    );
  });

  it("deleting a linear node reconnects its neighbors", () => {
    let state = snap();
    const mid = createBlock("action");
    const end = createBlock("end");
    state = addNode(state, mid, { x: 0, y: 120 });
    state = addNode(state, end, { x: 0, y: 240 });
    const a = connectNodes(state, { source: "trigger", port: "next", target: mid.id });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = connectNodes(a.snapshot, { source: mid.id, port: "success", target: end.id });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const deleted = deleteNodes(b.snapshot, [mid.id]);
    expect(deleted.graph.nodes.some((node) => node.id === mid.id)).toBe(false);
    expect(deleted.graph.edges).toEqual([
      expect.objectContaining({ source: "trigger", port: "next", target: end.id }),
    ]);
  });
});

describe("T07 — click/keyboard-equivalent commands", () => {
  it("chooses the selected open output when appending a block", () => {
    let state = snap();
    const action = createBlock("action");
    state = addNode(state, action, { x: 0, y: 120 });
    expect(appendConnection(state.graph, action.id)).toEqual({ source: action.id, port: "success" });
    const linked = connectNodes(state, { source: "trigger", port: "next", target: action.id });
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    expect(appendConnection(linked.snapshot.graph)).toEqual({ source: action.id, port: "success" });
  });

  it("auto-connects a clicked block to the selected step", () => {
    const state = initialEditorState();
    const action = createBlock("action", { actionType: "add_tag" });
    const next = editorReducer(state, {
      type: "add-node",
      node: action,
      position: { x: 0, y: 120 },
      connectFrom: { source: "trigger", port: "next" },
    });
    expect(next.graph.edges).toEqual([
      expect.objectContaining({ source: "trigger", port: "next", target: action.id }),
    ]);
  });

  it("builds a two-branch condition without drag and undoes it", () => {
    let state = initialEditorState();
    const condition = createBlock("condition");
    const yes = createBlock("action", { actionType: "add_tag" });
    const no = createBlock("end");
    if (no.type === "end") no.result = "stopped";
    state = editorReducer(state, { type: "add-node", node: condition, position: { x: 0, y: 120 } });
    state = editorReducer(state, { type: "add-node", node: yes, position: { x: -140, y: 240 } });
    state = editorReducer(state, { type: "add-node", node: no, position: { x: 140, y: 240 } });
    state = editorReducer(state, { type: "connect", source: "trigger", port: "next", target: condition.id });
    state = editorReducer(state, { type: "connect", source: condition.id, port: "true", target: yes.id });
    state = editorReducer(state, { type: "connect", source: condition.id, port: "false", target: no.id });
    expect(state.graph.edges).toHaveLength(3);
    expect(state.lastError).toBeNull();
    const beforeUndo = state.graph.edges.length;
    state = editorReducer(state, { type: "undo" });
    expect(state.graph.edges.length).toBe(beforeUndo - 1);
    state = editorReducer(state, { type: "redo" });
    expect(state.graph.edges).toHaveLength(3);
  });

  it("selects a step from the outline without drag", () => {
    let state = initialEditorState();
    const action = createBlock("action");
    state = editorReducer(state, { type: "add-node", node: action, position: { x: 0, y: 120 } });
    state = editorReducer(state, { type: "select", selection: { nodeIds: [action.id], edgeIds: [] } });
    expect(state.selection.nodeIds).toEqual([action.id]);
  });

  it("rejects a cycle with an explanation", () => {
    let state = initialEditorState();
    const action = createBlock("action");
    state = editorReducer(state, { type: "add-node", node: action, position: { x: 0, y: 120 } });
    state = editorReducer(state, { type: "connect", source: "trigger", port: "next", target: action.id });
    state = editorReducer(state, { type: "connect", source: action.id, port: "success", target: "trigger" });
    expect(state.lastError).toMatch(/trigger|cycle/i);
  });
});

describe("T25 — 100 nodes stay structurally valid to compile size limits", () => {
  it("accepts a 100-node line under the product cap", () => {
    let state = snap();
    let previous = "trigger";
    for (let i = 0; i < 99; i += 1) {
      const node = createBlock(i === 98 ? "end" : "action");
      state = addNode(state, node, { x: 0, y: (i + 1) * 96 });
      const port = previous === "trigger" ? "next" : "success";
      const result = connectNodes(state, { source: previous, port, target: node.id });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.snapshot;
      previous = node.id;
    }
    expect(state.graph.nodes).toHaveLength(100);
    expect(validateGraph(state.graph).length).toBeLessThan(5);
  });
});
