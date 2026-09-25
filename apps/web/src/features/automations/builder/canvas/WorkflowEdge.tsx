"use client";

import { Plus } from "lucide-react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";

import { useCanvasActions } from "./canvas-actions";
import { StepSelector } from "./StepSelector";

export function WorkflowCanvasEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
}: EdgeProps<Edge<{ port?: string }>>) {
  const { insertOnEdge, selectEdge } = useCanvasActions();

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  });

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: "var(--foreground)",
          strokeWidth: selected ? 2 : 1.25,
          transition: "stroke-width 150ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute -translate-x-1/2 -translate-y-1/2"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <StepSelector
            title="Insert step"
            onSelect={(kind, actionType) => insertOnEdge(id, kind, actionType)}
            trigger={
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded-full border border-border bg-pure-snow text-xs font-medium text-foreground shadow-xs transition-transform hover:scale-110 active:scale-95"
                aria-label="Insert a step on this connection"
                onClick={(event) => {
                  event.stopPropagation();
                  selectEdge(id);
                }}
              >
                <Plus className="size-3" aria-hidden />
              </button>
            }
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
