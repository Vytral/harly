/**
 * Single source of truth for every keyboard shortcut. `useShortcut(id, …)`
 * reads its keys from here and the "Keyboard shortcuts" dialog renders this
 * list, so what is documented and what is bound can never drift apart.
 */

export type ShortcutGroup = "General" | "Go to" | "Candidate page";

export type ShortcutDef = {
  /** Space-separated sequence, matched on KeyboardEvent.key ("g h", "?"). */
  keys: string;
  label: string;
  group: ShortcutGroup;
};

export const SHORTCUTS = {
  "help.open": { keys: "?", label: "Show keyboard shortcuts", group: "General" },
  "search.open": { keys: "/", label: "Search (opens the command menu)", group: "General" },
  "create.open": { keys: "c", label: "Open the Create menu", group: "General" },

  "go.home": { keys: "g h", label: "Go to Home", group: "Go to" },
  "go.candidates": { keys: "g c", label: "Go to Candidates", group: "Go to" },
  "go.pipeline": { keys: "g p", label: "Go to Pipeline", group: "Go to" },
  "go.jobs": { keys: "g j", label: "Go to Jobs", group: "Go to" },
  "go.tasks": { keys: "g t", label: "Go to Tasks", group: "Go to" },
  "go.review": { keys: "g r", label: "Go to your review queue", group: "Go to" },

  "candidate.next": { keys: "j", label: "Next candidate in the list", group: "Candidate page" },
  "candidate.prev": { keys: "k", label: "Previous candidate in the list", group: "Candidate page" },
  "candidate.move": { keys: "m", label: "Move to the next stage", group: "Candidate page" },
  "candidate.reject": { keys: "r", label: "Reject candidate", group: "Candidate page" },
  "candidate.evaluate": { keys: "e", label: "Evaluate", group: "Candidate page" },
  "candidate.schedule": { keys: "s", label: "Schedule an interview", group: "Candidate page" },
} as const satisfies Record<string, ShortcutDef>;

export type ShortcutId = keyof typeof SHORTCUTS;

export const GROUP_ORDER: readonly ShortcutGroup[] = ["General", "Go to", "Candidate page"];

/** Reserved by the app; a catalog entry must never reuse these. */
export const RESERVED_CHORDS = ["⌘K", "⌘J"] as const;

export function shortcutKeys(id: ShortcutId): string[] {
  return SHORTCUTS[id].keys.split(" ");
}

/** Display form of one key ("g" -> "G", "?" stays). */
export function displayKey(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

/** "Move to Screening · M": a tooltip/title string that carries the hint. */
export function withHint(label: string, id: ShortcutId): string {
  return `${label} · ${shortcutKeys(id).map(displayKey).join(" ")}`;
}

/** ARIA value for `aria-keyshortcuts` ("G H" is not valid; sequences use a space). */
export function ariaKeys(id: ShortcutId): string {
  return shortcutKeys(id).map(displayKey).join(" ");
}
