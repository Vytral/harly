"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

/**
 * Guards a full-screen editor against losing unsaved work. Returns a
 * `confirmDiscard` helper plus dialog state for in-app exits so those can use
 * Harly's styled confirm dialog instead of native browser prompts.
 *
 * While `dirty` it also:
 * - asks the browser to confirm refresh / tab close (`beforeunload`; browsers
 *   only show their own generic prompt there);
 * - intercepts clicks on same-origin links anywhere in the document (app
 *   router navigations have no cancellable event), shows the styled dialog and
 *   only then navigates.
 *
 * Reusable by any focus-mode builder (career page, automations, job editor, …).
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
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

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers need returnValue set to show the prompt.
      event.returnValue = "";
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same-page hash links don't leave the editor.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      event.preventDefault();
      event.stopPropagation();
      resolveRef.current = (ok) => {
        if (ok) router.push(`${url.pathname}${url.search}${url.hash}` as Route);
      };
      setDialogOpen(true);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase so we run before next/link's own click handler.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, router]);

  return {
    confirmDiscard,
    discardDialogProps: {
      open: dialogOpen,
      onConfirm: () => resolveDialog(true),
      onCancel: () => resolveDialog(false),
    },
  };
}
