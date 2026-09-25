"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Copy, Redo2, Trash2, Undo2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import type { EditorLayout, WorkflowGraphV2 } from "../../definition/schema-v2";
import { createBlock, type BlockKind } from "../state/blocks";
import { appendConnection } from "../state/commands";
import { editorReducer, initialEditorState, type EditorAction, type EditorState } from "../state/editor-reducer";
import { layoutGraph } from "../state/layout";
import type { ActionType } from "../../schema";
import { ToolLibrary } from "../ToolLibrary";
import { ValidationPanel } from "../ValidationPanel";
import { WorkflowOutline } from "../WorkflowOutline";
import {
  NodeInspector,
  type InspectorBuilderData,
} from "../inspector/NodeInspector";
import { WorkflowCanvas } from "./WorkflowCanvas";

const PREFS_KEY = "harly.automations.canvas";

type CanvasPrefs = {
  showDots: boolean;
  showMinimap: boolean;
  layoutLocked: boolean;
};

function loadPrefs(): CanvasPrefs {
  if (typeof window === "undefined")
    return { showDots: true, showMinimap: false, layoutLocked: false };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw)
      return { showDots: true, showMinimap: false, layoutLocked: false };
    return {
      showDots: true,
      showMinimap: false,
      layoutLocked: false,
      ...JSON.parse(raw),
    };
  } catch {
    return { showDots: true, showMinimap: false, layoutLocked: false };
  }
}

export function EditorWorkspace({
  graph,
  layout,
  workflowId,
  builderData,
  onChange,
  state: externalState,
  dispatch: externalDispatch,
}: {
  graph: WorkflowGraphV2;
  layout: EditorLayout;
  workflowId?: string;
  builderData: InspectorBuilderData;
  onChange: (next: { graph: WorkflowGraphV2; layout: EditorLayout }) => void;
  state?: EditorState;
  dispatch?: React.Dispatch<EditorAction>;
}) {
  const [internalState, internalDispatch] = useReducer(editorReducer, undefined, () =>
    initialEditorState(graph, layout),
  );
  const state = externalState ?? internalState;
  const dispatch = externalDispatch ?? internalDispatch;
  const [prefs, setPrefs] = useState<CanvasPrefs>({
    showDots: true,
    showMinimap: false,
    layoutLocked: false,
  });
  const [prefsReady, setPrefsReady] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const arranging = useRef(false);
  const graphRef = useRef(state.graph);
  useEffect(() => {
    graphRef.current = state.graph;
  }, [state.graph]);
  const [panTool, setPanTool] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [showCanvas, setShowCanvas] = useState(true);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const compactLibrary = useMedia("(max-width: 1279px)");
  const compactInspector = useMedia("(max-width: 767px)");
  const onChangeRef = useRef(onChange);
  const skipEmit = useRef(true);
  const librarySearchRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (skipEmit.current) {
      skipEmit.current = false;
      return;
    }
    onChangeRef.current({ graph: state.graph, layout: state.layout });
  }, [state.graph, state.layout]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPrefs(loadPrefs());
      setPrefsReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* Optional preference storage. */
    }
  }, [prefs, prefsReady]);

  const selectNode = useCallback((nodeId: string) => {
    dispatch({ type: "select", selection: { nodeIds: [nodeId], edgeIds: [] } });
    setFocusNodeId(nodeId);
    setInspectorOpen(true);
  }, [dispatch]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.type === "keyup" && event.code === "Space") {
        setPanTool(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.closest(
          "input, textarea, select, button, [role='dialog'], [role='listbox'], [role='combobox'], [role='menu']",
        ) ||
          target.isContentEditable);
      if (event.code === "Space" && !typing) {
        event.preventDefault();
        setPanTool(event.type === "keydown");
        return;
      }
      if (typing || event.type !== "keydown" || event.repeat) return;
      const meta = event.metaKey || event.ctrlKey;
      if (event.key === "/" && !meta) {
        event.preventDefault();
        setLibraryOpen(true);
        window.setTimeout(() => librarySearchRef.current?.(), 0);
        return;
      }
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        dispatch({ type: "duplicate-selection" });
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "delete-selection" });
      } else if (event.key === "Escape") {
        dispatch({ type: "select", selection: { nodeIds: [], edgeIds: [] } });
        setLibraryOpen(false);
        setInspectorOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [dispatch]);

  const addBlock = useCallback(
    (kind: BlockKind, actionType?: string, toolVersion?: number) => {
      const positions = state.graph.nodes.map(
        (node, index) =>
          state.layout.positions[node.id] ?? { x: 48, y: 72 + index * 180 },
      );
      const connectFrom = appendConnection(
        state.graph,
        state.selection.nodeIds[0],
      );
      const node = createBlock(
        kind,
        actionType
          ? { actionType: actionType as ActionType, toolVersion }
          : {},
      );
      dispatch({
        type: "add-node",
        node,
        position: {
          x: 48,
          y: positions.length
            ? Math.max(...positions.map((p) => p.y)) + 180
            : 72,
        },
        connectFrom,
      });
      setFocusNodeId(node.id);
      setLibraryOpen(false);
      setInspectorOpen(true);
    },
    [dispatch, state.graph, state.layout.positions, state.selection.nodeIds],
  );

  const autoLayout = useCallback(async () => {
    if (arranging.current) return;
    arranging.current = true;
    setLayoutError(null);
    try {
      const positions = await layoutGraph(state.graph);
      if (graphRef.current === state.graph)
        dispatch({ type: "apply-layout", positions });
      else setLayoutError("The workflow changed while arranging. Try again.");
    } catch {
      setLayoutError(
        "Could not arrange the workflow. Your positions have been preserved.",
      );
    } finally {
      arranging.current = false;
    }
  }, [dispatch, state.graph]);

  const hasTrigger = state.graph.nodes.some((node) => node.type === "trigger");
  const selectedId = state.selection.nodeIds[0];
  const inspector = (
    <NodeInspector
      state={state}
      workflowId={workflowId}
      builderData={builderData}
      onDisconnect={(edgeId) => dispatch({ type: "disconnect", edgeId })}
      onChangeNode={(node) => dispatch({ type: "update-node", node })}
      onConnect={(source, port, target) =>
        dispatch({ type: "connect", source, port, target })
      }
      onSelectNode={(nodeId) =>
        dispatch({
          type: "select",
          selection: { nodeIds: nodeId ? [nodeId] : [], edgeIds: [] },
        })
      }
      onClose={() =>
        dispatch({
          type: "select",
          selection: { nodeIds: [], edgeIds: [] },
        })
      }
    />
  );
  const library = (
    <ToolLibrary
      onAdd={addBlock}
      hasTrigger={hasTrigger}
      searchRef={librarySearchRef}
      toolManifests={builderData.toolManifests}
    />
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="hidden w-[264px] shrink-0 flex-col border-r border-border xl:flex">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {library}
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline-c bg-warm-paper px-4 py-2 text-xs">
          <div className="flex items-center gap-2 text-soft-ink">
            <span className="font-chrome rounded-full bg-soft-kraft px-2 py-0.5 text-[11px] font-medium text-foreground">
              {state.graph.nodes.length} {state.graph.nodes.length === 1 ? "step" : "steps"}
            </span>
            <span>·</span>
            <span>{state.graph.edges.length} {state.graph.edges.length === 1 ? "connection" : "connections"}</span>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-pure-snow p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => dispatch({ type: "undo" })}
              disabled={!state.past.length}
              title="Undo (Cmd+Z)"
              aria-label="Undo"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-soft-kraft disabled:opacity-30"
            >
              <Undo2 className="size-3.5" />
              <span className="hidden sm:inline">Undo</span>
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "redo" })}
              disabled={!state.future.length}
              title="Redo (Cmd+Shift+Z)"
              aria-label="Redo"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-soft-kraft disabled:opacity-30"
            >
              <Redo2 className="size-3.5" />
              <span className="hidden sm:inline">Redo</span>
            </button>
            <div className="mx-1 h-3.5 w-px bg-hairline-c" aria-hidden />
            <button
              type="button"
              onClick={() => dispatch({ type: "duplicate-selection" })}
              disabled={!selectedId}
              title="Duplicate selected step (Cmd+D)"
              aria-label="Duplicate selected step"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-soft-kraft disabled:opacity-30"
            >
              <Copy className="size-3.5" />
              <span className="hidden sm:inline">Duplicate</span>
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "delete-selection" })}
              disabled={!selectedId && !state.selection.edgeIds.length}
              title="Delete selected (Backspace / Delete)"
              aria-label="Delete selected"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-danger-rust transition-colors hover:bg-danger-rust/10 disabled:opacity-30"
            >
              <Trash2 className="size-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 border-b border-hairline-c px-3 py-2 xl:hidden">
          <button
            type="button"
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium"
            onClick={() => setLibraryOpen(true)}
          >
            Blocks
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium xl:hidden"
            onClick={() => setShowCanvas((open) => !open)}
          >
            {showCanvas ? "Steps" : "Canvas"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium md:hidden"
            onClick={() => setInspectorOpen(true)}
          >
            Configure
          </button>
        </div>
        {state.lastError ? (
          <p className="border-b border-danger-rust/20 bg-danger-rust/5 px-3 py-2 text-xs text-danger-rust">
            {state.lastError}
          </p>
        ) : null}
        {layoutError ? (
          <p
            role="status"
            className="border-b border-border px-3 py-2 text-xs text-danger-rust"
          >
            {layoutError}
          </p>
        ) : null}
        <div className={cn("relative min-h-0 flex-1", !showCanvas && "hidden xl:block")}>
          <WorkflowCanvas
            state={state}
            dispatch={dispatch}
            showDots={prefs.showDots}
            showMinimap={prefs.showMinimap}
            layoutLocked={prefs.layoutLocked}
            panTool={panTool}
            focusNodeId={focusNodeId}
            onNodeSelected={() => setInspectorOpen(true)}
            onNodeAdded={(nodeId) => {
              setFocusNodeId(nodeId);
              setInspectorOpen(true);
            }}
            onToggleDots={() =>
              setPrefs((prev) => ({ ...prev, showDots: !prev.showDots }))
            }
            onToggleMinimap={() =>
              setPrefs((prev) => ({ ...prev, showMinimap: !prev.showMinimap }))
            }
            onToggleLock={() =>
              setPrefs((prev) => ({
                ...prev,
                layoutLocked: !prev.layoutLocked,
              }))
            }
            onTogglePan={() => setPanTool((value) => !value)}
            onAutoLayout={() => void autoLayout()}
          />
          <div className="pointer-events-auto absolute bottom-4 left-4 z-10">
            <ValidationPanel graph={state.graph} onSelect={selectNode} />
          </div>
        </div>
        {!showCanvas ? (
          <div className="min-h-0 flex-1 overflow-y-auto xl:hidden">
            <WorkflowOutline
              graph={state.graph}
              selectedId={selectedId}
              onSelect={selectNode}
            />
            <ValidationPanel graph={state.graph} onSelect={selectNode} floating={false} />
          </div>
        ) : null}
      </div>
      <div className="hidden w-[340px] shrink-0 lg:w-[360px] md:block">
        {inspector}
      </div>

      <Sheet
        open={compactLibrary && libraryOpen}
        onOpenChange={setLibraryOpen}
        mobilePresentation="bottom-on-mobile"
      >
        <SheetContent
          side="left"
          className="w-[264px] bg-warm-paper p-0 sm:max-w-[264px]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Blocks</SheetTitle>
            <SheetDescription>
              Choose a block to add to this workflow.
            </SheetDescription>
          </SheetHeader>
          {library}
        </SheetContent>
      </Sheet>
      <Sheet
        open={compactInspector && inspectorOpen && Boolean(selectedId)}
        onOpenChange={setInspectorOpen}
        mobilePresentation="bottom-on-mobile"
      >
        <SheetContent
          side="right"
          className="w-full bg-warm-paper p-0 sm:max-w-[360px]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Configure step</SheetTitle>
            <SheetDescription>
              Configure the selected workflow step.
            </SheetDescription>
          </SheetHeader>
          {inspector}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}
