"use client";

import { useCallback, useEffect } from "react";

/**
 * Guards a full-screen editor against losing unsaved work. Binds `beforeunload`
 * so tab-close / reload / browser-back prompt the native warning, and returns a
 * `confirmDiscard` helper for in-app exits (the router push you control).
 *
 * Reusable by any focus-mode builder (career page, future email builder, …).
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Modern spec: calling preventDefault triggers the native prompt.
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /**
   * Returns true when it's safe to proceed with an in-app navigation. When
   * dirty, shows a confirm() and only proceeds if the user accepts.
   */
  const confirmDiscard = useCallback(
    (message = "You have unsaved changes. Leave without saving?") => {
      if (!dirty) return true;
      return window.confirm(message);
    },
    [dirty],
  );

  return { confirmDiscard };
}
