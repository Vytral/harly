import { describe, expect, it } from "vitest";

import {
  beginSave,
  formatSaveStatus,
  initialSaveState,
  isDirty,
  markDirty,
  saveConflict,
  saveFailed,
  saveSucceeded,
} from "./save-controller";

describe("T03 — edits during an in-flight save stay dirty", () => {
  it("does not mark saved when a newer generation exists", () => {
    let state = markDirty(initialSaveState());
    const started = beginSave(state);
    expect(started.skip).toBe(false);
    expect(started.generation).toBe(1);
    state = started.state;
    state = markDirty(state);
    expect(state.kind).toBe("saving");
    expect(isDirty(state)).toBe(true);

    state = saveSucceeded(state, started.generation!, Date.UTC(2026, 8, 6, 15, 4));
    expect(state.kind).toBe("unsaved");
    expect(isDirty(state)).toBe(true);
    expect(state.queued).toBe(true);
    expect(formatSaveStatus(state)).toBe("Unsaved");
  });

  it("marks saved only when the finished generation is still the latest", () => {
    let state = markDirty(initialSaveState());
    const started = beginSave(state);
    state = saveSucceeded(started.state, started.generation!, Date.UTC(2026, 8, 6, 9, 30));
    expect(state.kind).toBe("saved");
    expect(isDirty(state)).toBe(false);
    expect(formatSaveStatus(state, Date.UTC(2026, 8, 6, 9, 30))).toMatch(/^Saved at \d{2}:\d{2}$/);
  });

  it("queues a second save instead of overlapping the in-flight one", () => {
    const state = markDirty(initialSaveState());
    const first = beginSave(state);
    const second = beginSave(first.state);
    expect(second.skip).toBe(true);
    expect(second.generation).toBeNull();
    expect(second.state.queued).toBe(true);
    expect(second.state.inFlightGeneration).toBe(first.generation);
  });

  it("keeps dirty after a failed or aborted save", () => {
    let state = markDirty(initialSaveState());
    const started = beginSave(state);
    state = saveFailed(started.state, started.generation!, "network down", true);
    expect(isDirty(state)).toBe(true);
    expect(state.kind).toBe("error");
    expect(state.lastError).toMatch(/interrupted/i);
  });
});

describe("T02 — incomplete drafts can still save", () => {
  it("beginSave does not require a valid graph", () => {
    const state = markDirty(initialSaveState());
    const started = beginSave(state);
    expect(started.skip).toBe(false);
    expect(started.generation).toBe(1);
  });
});

describe("409 conflict never overwrites local dirty state", () => {
  it("stays conflicted and dirty so a stale success cannot clear edits", () => {
    let state = markDirty(initialSaveState());
    const started = beginSave(state);
    state = markDirty(started.state);
    state = saveConflict(state, started.generation!, "This draft was saved elsewhere.", 4);
    expect(state.kind).toBe("conflict");
    expect(isDirty(state)).toBe(true);
    expect(formatSaveStatus(state)).toBe("Conflict");
    const replay = saveSucceeded(state, started.generation!, Date.now());
    expect(isDirty(replay)).toBe(true);
  });

  it("refuses to start another save while conflicted", () => {
    let state = markDirty(initialSaveState());
    const started = beginSave(state);
    state = saveConflict(started.state, started.generation!, "stale", 2);
    const retry = beginSave(state);
    expect(retry.skip).toBe(true);
    expect(retry.generation).toBeNull();
  });
});
