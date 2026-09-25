"use client";

import { createContext, useContext } from "react";

import type { ActionType } from "../../schema";
import type { BlockKind } from "../state/blocks";

export type CanvasActions = {
  insertOnEdge: (edgeId: string, kind?: BlockKind, actionType?: ActionType) => void;
  selectEdge: (edgeId: string) => void;
};

export const CanvasActionsContext = createContext<CanvasActions>({
  insertOnEdge: () => undefined,
  selectEdge: () => undefined,
});

export function useCanvasActions(): CanvasActions {
  return useContext(CanvasActionsContext);
}
