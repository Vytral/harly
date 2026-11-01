import { describe, expect, it } from "vitest";

import { SHORTCUTS } from "./catalog";
import {
  SEQUENCE_TIMEOUT_MS,
  createMatcher,
  isTypingTarget,
  parseBinding,
  shouldHandleKeyEvent,
} from "./matcher";

const el = (tagName: string, attrs: Record<string, string> = {}, extra = {}) => ({
  tagName,
  getAttribute: (name: string) => attrs[name] ?? null,
  ...extra,
});

describe("parseBinding", () => {
  it("splits sequences and lowercases single letters", () => {
    expect(parseBinding("G H")).toEqual(["g", "h"]);
    expect(parseBinding("?")).toEqual(["?"]);
  });
});

describe("createMatcher", () => {
  const bindings = ["g h", "g c", "j", "?"];

  it("matches single keys immediately", () => {
    const m = createMatcher(bindings);
    expect(m.feed("j", 0)).toEqual({ kind: "match", binding: "j" });
    expect(m.feed("?", 10)).toEqual({ kind: "match", binding: "?" });
  });

  it("matches a sequence across two keys and is case-insensitive", () => {
    const m = createMatcher(bindings);
    expect(m.feed("g", 0)).toEqual({ kind: "pending" });
    expect(m.pending).toBe(true);
    expect(m.feed("H", 200)).toEqual({ kind: "match", binding: "g h" });
    expect(m.pending).toBe(false);
  });

  it("ignores keys that match nothing", () => {
    const m = createMatcher(bindings);
    expect(m.feed("x", 0)).toEqual({ kind: "none" });
  });

  it("drops the prefix on a wrong second key", () => {
    const m = createMatcher(bindings);
    m.feed("g", 0);
    expect(m.feed("x", 100)).toEqual({ kind: "none" });
    expect(m.pending).toBe(false);
    // "h" alone is not a binding
    expect(m.feed("h", 200)).toEqual({ kind: "none" });
  });

  it("lets a wrong second key start a fresh binding", () => {
    const m = createMatcher(bindings);
    m.feed("g", 0);
    expect(m.feed("j", 100)).toEqual({ kind: "match", binding: "j" });
  });

  it("restarts when g is pressed twice", () => {
    const m = createMatcher(bindings);
    m.feed("g", 0);
    expect(m.feed("g", 100)).toEqual({ kind: "pending" });
    expect(m.feed("c", 200)).toEqual({ kind: "match", binding: "g c" });
  });

  it("forgets a half-typed sequence after the timeout", () => {
    const m = createMatcher(bindings);
    m.feed("g", 0);
    expect(m.feed("h", SEQUENCE_TIMEOUT_MS + 1)).toEqual({ kind: "none" });
  });

  it("keeps a sequence alive just inside the timeout", () => {
    const m = createMatcher(bindings);
    m.feed("g", 0);
    expect(m.feed("h", SEQUENCE_TIMEOUT_MS)).toEqual({ kind: "match", binding: "g h" });
  });

  it("reset() cancels a pending sequence", () => {
    const m = createMatcher(bindings);
    m.feed("g", 0);
    m.reset();
    expect(m.feed("h", 10)).toEqual({ kind: "none" });
  });
});

describe("isTypingTarget", () => {
  it("treats text fields, textareas, selects and contenteditable as typing", () => {
    expect(isTypingTarget(el("INPUT"))).toBe(true);
    expect(isTypingTarget(el("INPUT", { type: "search" }))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(el("SELECT"))).toBe(true);
    expect(isTypingTarget(el("DIV", {}, { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(el("DIV", { contenteditable: "true" }))).toBe(true);
    expect(isTypingTarget(el("DIV", { role: "textbox" }))).toBe(true);
    expect(isTypingTarget(el("DIV", {}, { closest: () => ({}) }))).toBe(true);
  });

  it("does not treat buttons, checkboxes or plain elements as typing", () => {
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isTypingTarget(el("INPUT", { type: "radio" }))).toBe(false);
    expect(isTypingTarget(el("DIV", { contenteditable: "false" }))).toBe(false);
    expect(isTypingTarget(el("BODY"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("shouldHandleKeyEvent", () => {
  const plain = { key: "j", target: el("BODY") };

  it("allows a plain key on a non-typing target", () => {
    expect(shouldHandleKeyEvent(plain, false)).toBe(true);
    expect(shouldHandleKeyEvent({ key: "?", target: el("BODY") }, false)).toBe(true);
  });

  it("blocks while the user types", () => {
    expect(shouldHandleKeyEvent({ key: "j", target: el("INPUT") }, false)).toBe(false);
    expect(shouldHandleKeyEvent({ key: "j", target: el("TEXTAREA") }, false)).toBe(false);
  });

  it("blocks while a dialog or menu is open", () => {
    expect(shouldHandleKeyEvent(plain, true)).toBe(false);
  });

  it("never fights ⌘K, ⌘J or other chords", () => {
    expect(shouldHandleKeyEvent({ ...plain, key: "k", metaKey: true }, false)).toBe(false);
    expect(shouldHandleKeyEvent({ ...plain, key: "j", ctrlKey: true }, false)).toBe(false);
    expect(shouldHandleKeyEvent({ ...plain, altKey: true }, false)).toBe(false);
  });

  it("ignores auto-repeat, IME composition, handled events and bare modifiers", () => {
    expect(shouldHandleKeyEvent({ ...plain, repeat: true }, false)).toBe(false);
    expect(shouldHandleKeyEvent({ ...plain, isComposing: true }, false)).toBe(false);
    expect(shouldHandleKeyEvent({ ...plain, defaultPrevented: true }, false)).toBe(false);
    expect(shouldHandleKeyEvent({ key: "Shift", target: el("BODY") }, false)).toBe(false);
  });
});

describe("catalog", () => {
  it("has no duplicate bindings and no binding that is a prefix of another", () => {
    // Page-scoped groups are never mounted together, so they may reuse a key
    // (j/k move through a list on both the candidate page and the inbox).
    const pageGroups = new Set<string>(["Candidate page", "Inbox"]);
    const defs = Object.values(SHORTCUTS);
    const scopes = ["global", ...pageGroups];
    for (const scope of scopes) {
      const keys = defs.filter((s) => s.group === scope || !pageGroups.has(s.group)).map((s) => s.keys);
      expect(new Set(keys).size).toBe(keys.length);
      for (const a of keys) {
        for (const b of keys) {
          if (a !== b) expect(b.startsWith(`${a} `)).toBe(false);
        }
      }
    }
  });

  it("does not claim ⌘K or ⌘J", () => {
    for (const { keys } of Object.values(SHORTCUTS)) {
      expect(keys).not.toMatch(/⌘|meta|ctrl/i);
    }
  });
});
