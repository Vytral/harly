/**
 * Pure keyboard-shortcut matching, kept free of React and the DOM so it can be
 * unit tested in a node environment.
 *
 * A binding is a space-separated sequence of keys: "j", "?", "g h". Keys are
 * compared case-insensitively on `KeyboardEvent.key`, so "G" and "g" match.
 */

/** How long a sequence stays "armed" after its first key. */
export const SEQUENCE_TIMEOUT_MS = 1200;

export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function parseBinding(binding: string): string[] {
  return binding.trim().split(/\s+/).filter(Boolean).map(normalizeKey);
}

/** The slice of an element the typing guard needs (a real Element satisfies it). */
export type TypingTargetLike = {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
};

const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/**
 * True when keystrokes belong to the user typing: text fields, selects,
 * contenteditable regions (rich text editors) and ARIA textbox/combobox widgets.
 * Checkboxes, radios and buttons are not typing targets.
 */
export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as TypingTargetLike;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el.getAttribute?.("type") ?? "").toLowerCase();
    return TEXT_INPUT_TYPES.has(type);
  }
  if (el.isContentEditable) return true;
  const editable = el.getAttribute?.("contenteditable");
  if (editable !== null && editable !== undefined && editable !== "false") return true;
  const role = el.getAttribute?.("role");
  if (role === "textbox" || role === "combobox" || role === "searchbox") return true;
  return Boolean(el.closest?.('[contenteditable=""],[contenteditable="true"],[role="textbox"]'));
}

export type KeyEventLike = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target?: unknown;
};

/**
 * Whether a keydown may trigger a shortcut at all. `overlayOpen` is true while
 * a dialog, sheet or menu is open (their own keyboard handling wins).
 */
export function shouldHandleKeyEvent(event: KeyEventLike, overlayOpen: boolean): boolean {
  if (overlayOpen) return false;
  if (event.defaultPrevented || event.isComposing) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.repeat) return false;
  if (isTypingTarget(event.target)) return false;
  // Bare modifier presses (Shift on its way to "?") are not keys of a binding.
  if (["Shift", "Meta", "Control", "Alt", "CapsLock", "Dead"].includes(event.key)) return false;
  return true;
}

export type MatchResult =
  /** A full binding was typed. */
  | { kind: "match"; binding: string }
  /** The key started or extended a longer sequence; wait for the next key. */
  | { kind: "pending" }
  | { kind: "none" };

/**
 * Sequence matcher over a fixed set of bindings. Feed it every eligible key; it
 * tracks the partial sequence and resets on timeout or a wrong key (a wrong key
 * that itself starts a binding starts a fresh sequence).
 */
export function createMatcher(bindings: readonly string[], timeoutMs = SEQUENCE_TIMEOUT_MS) {
  const parsed = bindings.map((binding) => ({ binding, keys: parseBinding(binding) }));
  let buffer: string[] = [];
  let lastAt = 0;

  function lookup(sequence: string[]): MatchResult {
    const exact = parsed.find(
      (entry) =>
        entry.keys.length === sequence.length &&
        entry.keys.every((key, index) => key === sequence[index]),
    );
    const longer = parsed.some(
      (entry) =>
        entry.keys.length > sequence.length &&
        sequence.every((key, index) => key === entry.keys[index]),
    );
    // A binding that is also the prefix of a longer one fires immediately; the
    // catalog avoids that overlap, so this only keeps the matcher total.
    if (exact) return { kind: "match", binding: exact.binding };
    if (longer) return { kind: "pending" };
    return { kind: "none" };
  }

  return {
    feed(rawKey: string, now: number): MatchResult {
      const key = normalizeKey(rawKey);
      if (buffer.length > 0 && now - lastAt > timeoutMs) buffer = [];

      let result = lookup([...buffer, key]);
      if (result.kind === "none" && buffer.length > 0) {
        // Wrong second key: forget the prefix, but let this key begin anew.
        buffer = [];
        result = lookup([key]);
      }

      if (result.kind === "pending") {
        buffer = [...buffer, key];
        lastAt = now;
      } else {
        buffer = [];
      }
      return result;
    },
    reset() {
      buffer = [];
    },
    /** True while a sequence is armed (e.g. after "g"). */
    get pending() {
      return buffer.length > 0;
    },
  };
}

export type Matcher = ReturnType<typeof createMatcher>;
