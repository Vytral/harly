"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("features.search.useWorkspaceSearch");
  const tActions = useTranslations("server.search.actions");
  const timeoutMessage = t("timeout");
  const failedMessage = tActions("searchFailed");
  const controller = useMemo(
    () =>
      new WorkspaceSearchController({
        search: searchWorkspaceAction,
        messages: { timeout: timeoutMessage, failed: failedMessage },
      }),
    [timeoutMessage, failedMessage],
  );

  useEffect(() => () => controller.cancel(), [controller]);

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  return { state, controller };
}
