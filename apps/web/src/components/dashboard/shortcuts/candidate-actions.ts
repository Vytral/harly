"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The candidate page's actions, published for the ⌘K palette. CandidateActionBar
 * registers what the viewer can do right now (label + a handler that drives the
 * same buttons/dialogs the shortcuts use); the palette only renders and calls
 * them, so there is one implementation per action.
 */
export type CandidateActionId = "move" | "reject" | "evaluate" | "schedule" | "email";

export type CandidateActionEntry = {
  label: string;
  run: () => void;
};

export type CandidateActions = Partial<Record<CandidateActionId, CandidateActionEntry>>;

const EMPTY: CandidateActions = {};
let current: CandidateActions = EMPTY;
let owner: symbol | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function publish(token: symbol, actions: CandidateActions) {
  owner = token;
  current = actions;
  emit();
}

function clear(token: symbol) {
  if (owner !== token) return;
  owner = null;
  current = EMPTY;
  emit();
}

export function useCandidateActions(): CandidateActions {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => EMPTY,
  );
}

/**
 * Publish `actions` while mounted. Handlers are read through a ref so the store
 * only changes when an action appears, disappears or is relabelled.
 */
export function usePublishCandidateActions(actions: CandidateActions, enabled = true) {
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });
  const token = useRef<symbol | null>(null);

  const signature = JSON.stringify(
    (Object.keys(actions) as CandidateActionId[])
      .sort()
      .map((id) => [id, actions[id]?.label ?? ""]),
  );

  useEffect(() => {
    if (!enabled) return;
    const mine = (token.current ??= Symbol("candidate-actions"));
    const published: CandidateActions = {};
    for (const [id, label] of JSON.parse(signature) as [CandidateActionId, string][]) {
      published[id] = { label, run: () => latest.current[id]?.run() };
    }
    publish(mine, published);
    return () => clear(mine);
  }, [signature, enabled]);
}
