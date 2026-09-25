import { emptyCanvasGraph, emptyLayout, type EditorLayout, type WorkflowGraphV2, type WorkflowNode } from "../../definition/schema-v2";
import {
  addNode,
  applyLayout,
  connectNodes,
  deleteNodes,
  disconnectEdge,
  duplicateNodes,
  insertOnEdge,
  moveNodes,
  type EditorSnapshot,
  updateNode,
} from "./commands";
import { HISTORY_LIMIT, pushSnapshot } from "./history";

export type EditorSelection = {
  nodeIds: string[];
  edgeIds: string[];
};

export type EditorState = EditorSnapshot & {
  selection: EditorSelection;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  lastError: string | null;
};

export type EditorAction =
  | { type: "hydrate"; graph: WorkflowGraphV2; layout: EditorLayout }
  | { type: "add-node"; node: WorkflowNode; position: { x: number; y: number }; connectFrom?: { source: string; port: string } | null }
  | { type: "move-nodes"; positions: Record<string, { x: number; y: number }> }
  | { type: "connect"; source: string; port: string; target: string }
  | { type: "disconnect"; edgeId: string }
  | { type: "insert-on-edge"; edgeId: string; node: WorkflowNode }
  | { type: "delete-selection" }
  | { type: "duplicate-selection" }
  | { type: "update-node"; node: WorkflowNode }
  | { type: "apply-layout"; positions: EditorLayout["positions"] }
  | { type: "apply-proposal"; graph: WorkflowGraphV2; layout: EditorLayout }
  | { type: "select"; selection: EditorSelection }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear-error" };

const emptySelection = (): EditorSelection => ({ nodeIds: [], edgeIds: [] });

export function initialEditorState(
  graph?: WorkflowGraphV2,
  layout?: EditorLayout,
): EditorState {
  return {
    graph: graph ?? emptyCanvasGraph(),
    layout: layout ?? emptyLayout(),
    selection: emptySelection(),
    past: [],
    future: [],
    lastError: null,
  };
}

function snapshotOf(state: EditorState): EditorSnapshot {
  return { graph: state.graph, layout: state.layout };
}

function commit(state: EditorState, next: EditorSnapshot, selection?: EditorSelection): EditorState {
  return {
    ...state,
    ...next,
    selection: selection ?? state.selection,
    past: pushSnapshot(state.past, snapshotOf(state)).slice(-HISTORY_LIMIT),
    future: [],
    lastError: null,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "hydrate":
      return initialEditorState(action.graph, action.layout);
    case "add-node": {
      let next = addNode(state, action.node, action.position);
      if (action.connectFrom) {
        const connection = connectNodes(next, {
          source: action.connectFrom.source,
          port: action.connectFrom.port,
          target: action.node.id,
        });
        if (connection.ok) next = connection.snapshot;
      }
      return commit(state, next, {
        nodeIds: [action.node.id],
        edgeIds: [],
      });
    }
    case "move-nodes":
      return commit(state, moveNodes(state, action.positions));
    case "connect": {
      const result = connectNodes(state, action);
      if (!result.ok) return { ...state, lastError: result.reason };
      return commit(state, result.snapshot);
    }
    case "disconnect":
      return commit(state, disconnectEdge(state, action.edgeId), { nodeIds: [], edgeIds: [] });
    case "insert-on-edge": {
      const result = insertOnEdge(state, action.edgeId, action.node);
      if (!result.ok) return { ...state, lastError: result.reason };
      return commit(state, result.snapshot, { nodeIds: [action.node.id], edgeIds: [] });
    }
    case "delete-selection":
      if (state.selection.edgeIds.length > 0 && state.selection.nodeIds.length === 0) {
        let next: EditorSnapshot = state;
        for (const edgeId of state.selection.edgeIds) next = disconnectEdge(next, edgeId);
        return commit(state, next, emptySelection());
      }
      return commit(state, deleteNodes(state, state.selection.nodeIds), emptySelection());
    case "duplicate-selection":
      return commit(state, duplicateNodes(state, state.selection.nodeIds));
    case "update-node":
      return commit(state, updateNode(state, action.node));
    case "apply-layout":
      return commit(state, applyLayout(state, action.positions));
    case "apply-proposal":
      return commit(state, { graph: action.graph, layout: action.layout });
    case "select":
      return { ...state, selection: action.selection, lastError: null };
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        ...previous,
        past: state.past.slice(0, -1),
        future: [snapshotOf(state), ...state.future].slice(0, HISTORY_LIMIT),
        lastError: null,
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        ...next,
        past: pushSnapshot(state.past, snapshotOf(state)),
        future: state.future.slice(1),
        lastError: null,
      };
    }
    case "clear-error":
      return { ...state, lastError: null };
    default:
      return state;
  }
}
