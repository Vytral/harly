"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny open/close store for the "Keyboard shortcuts" dialog, so the ⌘K palette,
 * the "?" key and any future menu can open it without prop drilling.
 */
let helpOpen = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setShortcutsHelpOpen(next: boolean) {
  if (helpOpen === next) return;
  helpOpen = next;
  emit();
}

export function openShortcutsHelp() {
  setShortcutsHelpOpen(true);
}

export function useShortcutsHelpOpen() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => helpOpen,
    () => false,
  );
}
