export const AUTOSAVE_DELAY_MS = 1500;

export type SaveKind =
  | "unsaved"
  | "saving"
  | "saved"
  | "offline"
  | "conflict"
  | "error";

export type SaveState = {
  kind: SaveKind;
  dirtyGeneration: number;
  lastSavedGeneration: number;
  inFlightGeneration: number | null;
  queued: boolean;
  lastSavedAt: number | null;
  lastError: string | null;
  conflictMessage: string | null;
  serverRevision: number | null;
  online: boolean;
};

export function initialSaveState(online = true, isNew = false): SaveState {
  return {
    kind: isNew ? "unsaved" : "saved",
    dirtyGeneration: isNew ? 1 : 0,
    lastSavedGeneration: 0,
    inFlightGeneration: null,
    queued: false,
    lastSavedAt: null,
    lastError: null,
    conflictMessage: null,
    serverRevision: null,
    online,
  };
}

export function isDirty(state: SaveState): boolean {
  return state.dirtyGeneration !== state.lastSavedGeneration;
}

export function markDirty(state: SaveState): SaveState {
  const dirtyGeneration = state.dirtyGeneration + 1;
  if (state.kind === "conflict") {
    return { ...state, dirtyGeneration };
  }
  if (!state.online) {
    return { ...state, dirtyGeneration, kind: "offline" };
  }
  if (state.inFlightGeneration != null) {
    return { ...state, dirtyGeneration, kind: "saving", queued: true };
  }
  return { ...state, dirtyGeneration, kind: "unsaved", lastError: null };
}

export function beginSave(state: SaveState): {
  state: SaveState;
  generation: number | null;
  skip: boolean;
} {
  if (state.kind === "conflict") {
    return { state, generation: null, skip: true };
  }
  if (!state.online) {
    return {
      state: { ...state, kind: "offline" },
      generation: null,
      skip: true,
    };
  }
  if (state.inFlightGeneration != null) {
    return {
      state: { ...state, queued: true, kind: "saving" },
      generation: null,
      skip: true,
    };
  }
  if (!isDirty(state)) {
    return { state, generation: null, skip: true };
  }
  const generation = state.dirtyGeneration;
  return {
    state: {
      ...state,
      kind: "saving",
      inFlightGeneration: generation,
      queued: false,
      lastError: null,
    },
    generation,
    skip: false,
  };
}

export function saveSucceeded(
  state: SaveState,
  generation: number,
  savedAt: number,
): SaveState {
  const inFlight =
    state.inFlightGeneration === generation ? null : state.inFlightGeneration;
  const lastSavedGeneration =
    generation >= state.lastSavedGeneration
      ? generation
      : state.lastSavedGeneration;
  const dirty = state.dirtyGeneration !== lastSavedGeneration;
  return {
    ...state,
    inFlightGeneration: inFlight,
    lastSavedGeneration,
    lastSavedAt:
      generation >= state.lastSavedGeneration ? savedAt : state.lastSavedAt,
    lastError: null,
    conflictMessage: null,
    serverRevision: null,
    queued: dirty,
    kind: inFlight != null ? "saving" : dirty ? "unsaved" : "saved",
  };
}

export function saveSucceededNow(
  state: SaveState,
  generation: number,
): SaveState {
  return saveSucceeded(state, generation, Date.now());
}

export function saveFailed(
  state: SaveState,
  generation: number,
  message: string,
  aborted = false,
): SaveState {
  const inFlight =
    state.inFlightGeneration === generation ? null : state.inFlightGeneration;
  return {
    ...state,
    inFlightGeneration: inFlight,
    queued: isDirty(state),
    lastError: aborted
      ? "Save was interrupted. Checking the server before retrying."
      : message,
    kind: inFlight != null ? "saving" : state.online ? "error" : "offline",
  };
}

export function saveConflict(
  state: SaveState,
  generation: number,
  message: string,
  serverRevision: number | null,
): SaveState {
  return {
    ...state,
    inFlightGeneration:
      state.inFlightGeneration === generation ? null : state.inFlightGeneration,
    queued: false,
    kind: "conflict",
    lastError: message,
    conflictMessage: message,
    serverRevision,
  };
}

export function setOnline(state: SaveState, online: boolean): SaveState {
  if (online === state.online) return state;
  if (!online) {
    return {
      ...state,
      online: false,
      kind: state.kind === "saving" ? "saving" : "offline",
    };
  }
  if (state.kind === "conflict") return { ...state, online: true };
  if (state.inFlightGeneration != null)
    return { ...state, online: true, kind: "saving" };
  return {
    ...state,
    online: true,
    kind: isDirty(state) ? "unsaved" : state.lastSavedAt ? "saved" : state.kind,
  };
}

export function clearConflict(state: SaveState): SaveState {
  return {
    ...state,
    kind: isDirty(state) ? "unsaved" : "saved",
    conflictMessage: null,
    serverRevision: null,
    lastError: null,
  };
}

export function formatSaveStatus(state: SaveState, now = Date.now()): string {
  switch (state.kind) {
    case "unsaved":
      return state.lastSavedAt ? "Unsaved" : "Not saved yet";
    case "saving":
      return "Saving…";
    case "saved": {
      if (!state.lastSavedAt) return "Saved";
      const time = new Date(state.lastSavedAt);
      const hh = String(time.getHours()).padStart(2, "0");
      const mm = String(time.getMinutes()).padStart(2, "0");
      if (now - state.lastSavedAt > 18 * 60 * 60 * 1000)
        return `Saved at ${hh}:${mm}`;
      return `Saved at ${hh}:${mm}`;
    }
    case "offline":
      return "Offline";
    case "conflict":
      return "Conflict";
    case "error":
      return "Error saving";
  }
}
