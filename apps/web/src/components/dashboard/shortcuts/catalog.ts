/**
 * Single source of truth for every keyboard shortcut. `useShortcut(id, …)`
 * reads its keys from here and the "Keyboard shortcuts" dialog renders this
 * list, so what is documented and what is bound can never drift apart.
 */

export type ShortcutGroup = "General" | "Go to" | "Candidate page" | "Inbox";

export type ShortcutDef = {
  /** Space-separated sequence, matched on KeyboardEvent.key ("g h", "?"). */
  keys: string;
  group: ShortcutGroup;
};

export const SHORTCUTS = {
  "help.open": { keys: "?", group: "General" },
  "search.open": { keys: "/", group: "General" },
  "create.open": { keys: "c", group: "General" },

  "go.home": { keys: "g h", group: "Go to" },
  "go.candidates": { keys: "g c", group: "Go to" },
  "go.pipeline": { keys: "g p", group: "Go to" },
  "go.jobs": { keys: "g j", group: "Go to" },
  "go.tasks": { keys: "g t", group: "Go to" },
  "go.review": { keys: "g r", group: "Go to" },

  "candidate.next": { keys: "j", group: "Candidate page" },
  "candidate.prev": { keys: "k", group: "Candidate page" },
  "candidate.move": { keys: "m", group: "Candidate page" },
  "candidate.reject": { keys: "r", group: "Candidate page" },
  "candidate.evaluate": { keys: "e", group: "Candidate page" },
  "candidate.schedule": { keys: "s", group: "Candidate page" },

  "inbox.next": { keys: "j", group: "Inbox" },
  "inbox.prev": { keys: "k", group: "Inbox" },
  "inbox.reply": { keys: "r", group: "Inbox" },
  "inbox.archive": { keys: "e", group: "Inbox" },
} as const satisfies Record<string, ShortcutDef>;

export type ShortcutId = keyof typeof SHORTCUTS;

export const GROUP_ORDER: readonly ShortcutGroup[] = ["General", "Go to", "Candidate page", "Inbox"];

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
