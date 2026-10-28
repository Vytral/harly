"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import { searchWorkspaceAction } from "./actions";
import {
  WorkspaceSearchController,
  type WorkspaceSearchState,
} from "./search-controller";

/**
 * React binding for the palette search. One controller per mounted palette; the
 * effect cleanup only cancels pending work, so React StrictMode remounts are safe.
 */
export function useWorkspaceSearch(): {
  state: WorkspaceSearchState;
  controller: WorkspaceSearchController;
} {
  const controller = useMemo(
    () => new WorkspaceSearchController({ search: searchWorkspaceAction }),
    [],
  );

  useEffect(() => () => controller.cancel(), [controller]);

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  return { state, controller };
}
