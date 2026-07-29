export type IslandStatus = "loading" | "success" | "error";

export type IslandItem = {
  id: string;
  status: IslandStatus;
  message: string;
};

export type IslandState = {
  item: IslandItem | null;
  /** Notifications replaced by a newer one before they got seen, since the island last went idle. */
  replacedCount: number;
};

type Listener = () => void;

let state: IslandState = { item: null, replacedCount: 0 };
const listeners = new Set<Listener>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

// Success/error are transient; loading has no timer (cleared by promise()/settle()).
function scheduleAutoHide(ms: number) {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    state = { item: null, replacedCount: 0 };
    emit();
  }, ms);
}

export function getIslandState() {
  return state;
}

export function subscribeIsland(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pushIsland(status: IslandStatus, message: string, autoHideMs?: number) {
  clearHideTimer();
  const wasActive = state.item !== null && state.item.status !== "loading";
  const id = crypto.randomUUID();
  state = {
    item: { id, status, message },
    // A pending loading item isn't "replaced" — it's resolved by this call.
    replacedCount: wasActive ? state.replacedCount + 1 : 0,
  };
  emit();
  if (autoHideMs) scheduleAutoHide(autoHideMs);
  return id;
}

export function settleIsland(id: string, status: "success" | "error", message: string, autoHideMs: number) {
  if (state.item?.id !== id) return;
  state = { item: { id, status, message }, replacedCount: state.replacedCount };
  emit();
  scheduleAutoHide(autoHideMs);
}

export function dismissIsland(id?: string) {
  if (id && state.item?.id !== id) return;
  clearHideTimer();
  state = { item: null, replacedCount: 0 };
  emit();
}
