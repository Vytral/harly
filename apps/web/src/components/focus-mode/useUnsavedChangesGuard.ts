"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Guards a full-screen editor against losing unsaved work. Returns a
 * `confirmDiscard` helper plus dialog state for in-app exits so those can use
 * Harly's styled confirm dialog instead of native browser prompts.
 *
 * Reusable by any focus-mode builder (career page, automations, job editor, …).
 */
export function useUnsavedChangesGuard(dirty: boolean) {

  const [dialogOpen, setDialogOpen] = useState(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  /**
   * Returns a promise that resolves true when it's safe to proceed with an
   * in-app navigation. When dirty, opens the styled confirm dialog and
   * resolves with the user's choice.
   */
  const confirmDiscard = useCallback(() => {
    if (!dirty) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setDialogOpen(true);
    });
  }, [dirty]);

  const resolveDialog = useCallback((value: boolean) => {
    setDialogOpen(false);
    resolveRef.current?.(value);
    resolveRef.current = null;
  }, []);

  return {
    confirmDiscard,
    discardDialogProps: {
      open: dialogOpen,
      onConfirm: () => resolveDialog(true),
      onCancel: () => resolveDialog(false),
    },
  };
}
