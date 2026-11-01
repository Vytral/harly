"use client";

import { useEffect, useRef } from "react";

import { SHORTCUTS, type ShortcutId } from "./catalog";
import { createMatcher, shouldHandleKeyEvent, type Matcher } from "./matcher";

type Registration = {
  id: ShortcutId;
  handlerRef: { current: () => void };
};

/** Open dialogs, sheets, menus and the command palette own the keyboard. */
const OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  "[cmdk-root]",
].join(",");

export function isOverlayOpen(doc: Pick<Document, "querySelector"> = document): boolean {
  return doc.querySelector(OVERLAY_SELECTOR) !== null;
}

const registrations = new Set<Registration>();
let matcher: Matcher | null = null;
let matcherKey = "";
let listening = false;

function currentMatcher(): Matcher {
  const bindings = [...new Set([...registrations].map((r) => SHORTCUTS[r.id].keys))].sort();
  const key = bindings.join("|");
  if (!matcher || key !== matcherKey) {
    matcher = createMatcher(bindings);
    matcherKey = key;
  }
  return matcher;
}

function onKeyDown(event: KeyboardEvent) {
  if (!shouldHandleKeyEvent(event, isOverlayOpen())) {
    // An open overlay or a typing field cancels a half-typed sequence.
    matcher?.reset();
    return;
  }
  const result = currentMatcher().feed(event.key, Date.now());
  if (result.kind === "pending") return;
  if (result.kind !== "match") return;
  const targets = [...registrations].filter((r) => SHORTCUTS[r.id].keys === result.binding);
  if (targets.length === 0) return;
  event.preventDefault();
  // Latest registration wins when a page re-registers a key (none do today).
  targets[targets.length - 1]?.handlerRef.current();
}

function ensureListener() {
  if (listening || typeof document === "undefined") return;
  document.addEventListener("keydown", onKeyDown);
  listening = true;
}

function releaseListener() {
  if (registrations.size > 0 || !listening) return;
  document.removeEventListener("keydown", onKeyDown);
  listening = false;
  matcher = null;
  matcherKey = "";
}

/**
 * Bind a catalog shortcut while the calling component is mounted. Ignored while
 * the user is typing or any dialog/menu is open. `enabled: false` unbinds it
 * (use this for permissions and disabled actions so a key never does nothing
 * silently while the button is hidden).
 */
export function useShortcut(
  id: ShortcutId,
  handler: () => void,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const registration: Registration = { id, handlerRef };
    registrations.add(registration);
    ensureListener();
    return () => {
      registrations.delete(registration);
      releaseListener();
    };
  }, [id, enabled]);
}
