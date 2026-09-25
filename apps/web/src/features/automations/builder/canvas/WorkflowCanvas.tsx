"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Node,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "@/components/ThemeProvider";

import { cn } from "@/lib/utils";
import type { EditorAction, EditorState } from "../state/editor-reducer";
import { NODE_HEIGHT, NODE_WIDTH } from "../state/layout";
import { graphToFlow, type CanvasNodeData } from "../state/graph-to-flow";
import { createBlock, type BlockKind } from "../state/blocks";
import { appendConnection, explainConnect } from "../state/commands";
import { CanvasActionsContext } from "./canvas-actions";
import { CanvasControls } from "./CanvasControls";
import { WorkflowCanvasEdge } from "./WorkflowEdge";
import { WorkflowCanvasNode } from "./WorkflowNode";

const nodeTypes = { harly: WorkflowCanvasNode };
const edgeTypes = { harly: WorkflowCanvasEdge };

function CanvasInner({
  state,
  dispatch,
  showDots,
  showMinimap,
  layoutLocked,
  panTool,
  onToggleDots,
  onToggleMinimap,
  onToggleLock,
  onTogglePan,
  onAutoLayout,
  focusNodeId,
  onNodeSelected,
  onNodeAdded,
}: {
  state: EditorState;
  dispatch: (action: EditorAction) => void;
  showDots: boolean;
  showMinimap: boolean;
  layoutLocked: boolean;
  panTool: boolean;
  focusNodeId?: string | null;
  onNodeSelected?: () => void;
  onNodeAdded?: (nodeId: string) => void;
  onToggleDots: () => void;
  onToggleMinimap: () => void;
  onToggleLock: () => void;
  onTogglePan: () => void;
  onAutoLayout: () => void;
}) {
  const { getIntersectingNodes, screenToFlowPosition, setCenter } = useReactFlow();
  const { resolvedTheme } = useTheme();
  // Keep the server render and the first client render identical. Reading the
  // resolved theme before hydration changes React Flow's className and causes
  // a hydration warning in the editor.
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  const dragPositions = useRef<Record<string, { x: number; y: number }>>({});
  const [livePositions, setLivePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());
  const lastFocused = useRef<string | null>(null);

  const markNodeAsNew = useCallback((nodeId: string) => {
    setNewlyAddedIds((prev) => new Set(prev).add(nodeId));
    // Drop the "isNew" flag once the entrance animation has had time to
    // play, so re-selecting or re-rendering the node later never replays it.
    window.setTimeout(() => {
      setNewlyAddedIds((prev) => {
        if (!prev.has(nodeId)) return prev;
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }, 400);
  }, []);
  const { nodes, edges } = useMemo(
    () => graphToFlow(state.graph, state.layout, state.selection),
    [state.graph, state.layout, state.selection],
  );

  useEffect(() => {
    if (!focusNodeId || lastFocused.current === focusNodeId) return;
    const position = state.layout.positions[focusNodeId];
    if (!position) return;
    lastFocused.current = focusNodeId;
    setCenter(position.x + NODE_WIDTH / 2, position.y + NODE_HEIGHT / 2, { zoom: 1, duration: 180 });
  }, [focusNodeId, setCenter, state.layout.positions]);

  const onNodesChange: OnNodesChange<Node<CanvasNodeData>> = useCallback(
    (changes) => {
      const selected = changes
        .filter((change) => change.type === "select")
        .reduce<string[] | null>((acc, change) => {
          if (change.type !== "select") return acc;
          const current = acc ?? state.selection.nodeIds;
          if (change.selected) return current.includes(change.id) ? current : [...current, change.id];
          return current.filter((id) => id !== change.id);
        }, null);
      if (selected) {
        dispatch({ type: "select", selection: { nodeIds: selected, edgeIds: [] } });
      }
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          dragPositions.current[change.id] = change.position;
        }
      }
      if (changes.some((change) => change.type === "position")) setLivePositions({ ...dragPositions.current });
    },
    [dispatch, state.selection.nodeIds],
  );

  const onNodeDragStop = useCallback(() => {
    const positions = dragPositions.current;
    dragPositions.current = {};
    setLivePositions({});
    if (Object.keys(positions).length === 0) return;
    dispatch({ type: "move-nodes", positions });
  }, [dispatch]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      dispatch({
        type: "connect",
        source: connection.source,
        port: connection.sourceHandle ?? "next",
        target: connection.target,
      });
    },
    [dispatch],
  );

  const isValidConnection = useCallback(
    (connection: Connection | EdgeLike) => {
      if (!connection.source || !connection.target) return false;
      return (
        explainConnect(
          state.graph,
          connection.source,
          connection.sourceHandle ?? "next",
          connection.target,
        ) === null
      );
    },
    [state.graph],
  );

  const onDragOverCanvas = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const [target] = getIntersectingNodes({ x: position.x, y: position.y, width: 2, height: 2 }, true);
      setDragOverNodeId(target?.id ?? null);
    },
    [getIntersectingNodes, screenToFlowPosition],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOverNodeId(null);
      const kind = event.dataTransfer.getData("application/harly-block") as BlockKind;
      if (!kind) return;
      const actionType = event.dataTransfer.getData("application/harly-action");
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const node = createBlock(kind, actionType ? { actionType: actionType as never } : {});

      // A drop over a step has an unambiguous meaning: insert the new block
      // on that step's incoming connection. Dropping on a trigger or an
      // orphan continues from the target. A free-canvas drop keeps the
      // selected/open-output append behavior used by click-to-add.
      const [target] = getIntersectingNodes({ x: position.x, y: position.y, width: 2, height: 2 }, true)
        .filter((candidate) => candidate.id !== node.id);
      if (target) {
        const incoming = state.graph.edges.filter((edge) => edge.target === target.id);
        if (incoming.length === 1) {
          dispatch({ type: "insert-on-edge", edgeId: incoming[0]!.id, node });
          markNodeAsNew(node.id);
          onNodeAdded?.(node.id);
          return;
        }
        const connectFrom = appendConnection(state.graph, target.id);
        dispatch({ type: "add-node", node, position, connectFrom });
        markNodeAsNew(node.id);
        onNodeAdded?.(node.id);
        return;
      }

      const connectFrom = appendConnection(state.graph, state.selection.nodeIds[0]);
      dispatch({
        type: "add-node",
        node,
        position,
        connectFrom,
      });
      markNodeAsNew(node.id);
      onNodeAdded?.(node.id);
    },
    [dispatch, getIntersectingNodes, markNodeAsNew, onNodeAdded, screenToFlowPosition, state.graph, state.selection.nodeIds],
  );

  const flow = hydrated ? (
    <ReactFlow
      colorMode={resolvedTheme === "dark" ? "dark" : "light"}
      nodes={nodes.map((node) => {
        const positioned = livePositions[node.id] ? { ...node, position: livePositions[node.id]! } : node;
        const withDropTarget = dragOverNodeId === node.id
          ? { ...positioned, data: { ...positioned.data, isDropTarget: true } }
          : positioned;
        return newlyAddedIds.has(node.id)
          ? { ...withDropTarget, data: { ...withDropTarget.data, isNew: true } }
          : withDropTarget;
      })}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={onNodeSelected}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      onPaneClick={() => dispatch({ type: "select", selection: { nodeIds: [], edgeIds: [] } })}
      onEdgeClick={(_, edge) =>
        dispatch({ type: "select", selection: { nodeIds: [], edgeIds: [edge.id] } })
      }
      onDragOver={onDragOverCanvas}
      onDragLeave={() => setDragOverNodeId(null)}
      onDrop={onDrop}
      minZoom={0.25}
      maxZoom={2}
      panOnScroll
      zoomOnPinch
      zoomOnScroll={false}
      zoomActivationKeyCode={["Control", "Meta"]}
      deleteKeyCode={null}
      panOnDrag={panTool ? true : [1, 2]}
      selectionOnDrag={!panTool}
      nodesDraggable={!layoutLocked}
      nodesConnectable
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
      proOptions={{ hideAttribution: true }}
      className={cn("h-full w-full bg-warm-paper")}
    >
      {showDots ? (
        <Background id="harly-dots" variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
      ) : null}
      {showMinimap ? (
        <MiniMap
          pannable
          zoomable
          bgColor="var(--warm-paper)"
          maskColor="rgba(23, 23, 23, 0.06)"
          style={{ bottom: 64, overflow: "hidden", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}
        />
      ) : null}
    </ReactFlow>
  ) : (
    <div className="h-full w-full bg-warm-paper" role="application" aria-label="Workflow canvas" />
  );

  return (
    <CanvasActionsContext.Provider
      value={{
        insertOnEdge: (edgeId, kind = "action", actionType) =>
          (() => {
            const node = createBlock(kind, { actionType });
            dispatch({ type: "insert-on-edge", edgeId, node });
            markNodeAsNew(node.id);
            onNodeAdded?.(node.id);
          })(),
        selectEdge: (edgeId) => dispatch({ type: "select", selection: { nodeIds: [], edgeIds: [edgeId] } }),
      }}
    >
      <div className="relative h-full min-h-0 w-full">
        {flow}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
          <CanvasControls
            showDots={showDots}
            showMinimap={showMinimap}
            layoutLocked={layoutLocked}
            panTool={panTool}
            onToggleDots={onToggleDots}
            onToggleMinimap={onToggleMinimap}
            onToggleLock={onToggleLock}
            onTogglePan={onTogglePan}
            onAutoLayout={onAutoLayout}
          />
        </div>
      </div>
    </CanvasActionsContext.Provider>
  );
}

type EdgeLike = { source?: string | null; target?: string | null; sourceHandle?: string | null };

export function WorkflowCanvas(props: React.ComponentProps<typeof CanvasInner>) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
