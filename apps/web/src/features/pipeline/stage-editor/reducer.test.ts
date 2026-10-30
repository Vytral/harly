import { describe, expect, it } from "vitest";

import type { EditorStage } from "./model";
import {
  CONFLICT_MESSAGE,
  editorReducer,
  initialEditorState,
  type EditorState,
} from "./reducer";

function stage(id: string, order: number, extra: Partial<EditorStage> = {}): EditorStage {
  return {
    id,
    name: id.toUpperCase(),
    color: null,
    kind: "custom",
    order,
    archivedAt: null,
    applicationCount: 0,
    emailConfig: { candidateUpdatesEnabled: true },
    ...extra,
  };
}

function loadedState(stages: EditorStage[]): EditorState {
  return editorReducer(initialEditorState, { type: "loaded", stages });
}

describe("loading", () => {
  it("stores the server stages and marks the editor loaded", () => {
    const state = loadedState([stage("a", 0)]);
    expect(state.loaded).toBe(true);
    expect(state.loading).toBe(false);
    expect(state.stages.map((s) => s.id)).toEqual(["a"]);
  });

  it("shows a load error full-page when nothing has loaded yet", () => {
    const started = editorReducer(initialEditorState, { type: "load_started" });
    const failed = editorReducer(started, { type: "load_failed", message: "Nope" });
    expect(failed.loadError).toBe("Nope");
    expect(failed.loading).toBe(false);
    expect(failed.notice).toBeNull();
  });

  it("shows a refresh failure as a notice once stages are on screen", () => {
    const failed = editorReducer(loadedState([stage("a", 0)]), {
      type: "load_failed",
      message: "Offline",
    });
    expect(failed.notice).toBe("Offline");
    expect(failed.stages).toHaveLength(1);
  });
});

describe("optimistic reorder", () => {
  const base = loadedState([stage("a", 0), stage("b", 1), stage("c", 2)]);

  it("applies the new order locally and keeps the snapshot for rollback", () => {
    const pending = editorReducer(base, { type: "operation_started", pending: { kind: "reorder" } });
    const previewed = editorReducer(pending, { type: "reorder_previewed", ids: ["c", "a", "b"] });
    expect(previewed.stages.filter((s) => !s.archivedAt).sort((x, y) => x.order - y.order).map((s) => s.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(previewed.snapshot?.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("restores the snapshot when the server refuses the change", () => {
    let state = editorReducer(base, { type: "operation_started", pending: { kind: "reorder" } });
    state = editorReducer(state, { type: "reorder_previewed", ids: ["c", "a", "b"] });
    state = editorReducer(state, { type: "operation_failed", message: "Rejected" });
    expect(state.stages.map((s) => [s.id, s.order])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
    expect(state.snapshot).toBeNull();
    expect(state.pending).toBeNull();
    expect(state.notice).toBe("Rejected");
  });

  it("keeps archived stages in place while active ones reorder", () => {
    const withArchived = loadedState([
      stage("a", 0),
      stage("old", 1, { archivedAt: new Date("2026-01-01T00:00:00Z") }),
      stage("b", 2),
    ]);
    const previewed = editorReducer(withArchived, {
      type: "reorder_previewed",
      ids: ["b", "a"],
    });
    expect(previewed.stages.find((s) => s.id === "old")?.order).toBe(1);
    expect(previewed.stages.find((s) => s.id === "b")?.order).toBe(0);
    expect(previewed.stages.find((s) => s.id === "a")?.order).toBe(1);
  });
});

describe("operations", () => {
  it("marks the operation pending and clears an older notice", () => {
    let state = editorReducer(loadedState([stage("a", 0)]), { type: "operation_failed", message: "x" });
    state = editorReducer(state, { type: "operation_started", pending: { kind: "save", stageId: "a" } });
    expect(state.pending).toEqual({ kind: "save", stageId: "a" });
    expect(state.notice).toBeNull();
  });

  it("clears pending and records the announcement on success", () => {
    let state = editorReducer(loadedState([stage("a", 0)]), {
      type: "operation_started",
      pending: { kind: "create" },
    });
    state = editorReducer(state, { type: "operation_succeeded", announcement: "Added Tech test." });
    expect(state.pending).toBeNull();
    expect(state.announcement).toBe("Added Tech test.");
  });

  it("dismisses and announces without touching stages", () => {
    let state = editorReducer(loadedState([stage("a", 0)]), { type: "operation_failed", message: "x" });
    state = editorReducer(state, { type: "notice_dismissed" });
    expect(state.notice).toBeNull();
    state = editorReducer(state, { type: "announced", text: "Hello" });
    expect(state.announcement).toBe("Hello");
    expect(state.stages).toHaveLength(1);
  });
});

describe("conflicts", () => {
  it("replaces local state with the fresh pipeline and explains what happened", () => {
    const local = loadedState([stage("a", 0), stage("b", 1)]);
    const pending = editorReducer(local, { type: "operation_started", pending: { kind: "reorder" } });
    const previewed = editorReducer(pending, { type: "reorder_previewed", ids: ["b", "a"] });
    const fresh = [stage("a", 0), stage("b", 1), stage("c", 2)];
    const conflicted = editorReducer(previewed, {
      type: "conflict",
      stages: fresh,
      detail: "Stage names must be unique.",
    });
    expect(conflicted.stages).toBe(fresh);
    expect(conflicted.snapshot).toBeNull();
    expect(conflicted.pending).toBeNull();
    expect(conflicted.notice).toBe(`${CONFLICT_MESSAGE} Stage names must be unique.`);
    expect(conflicted.announcement).toBe(CONFLICT_MESSAGE);
  });

  it("uses the bare conflict message when the server gave no detail", () => {
    const conflicted = editorReducer(loadedState([stage("a", 0)]), {
      type: "conflict",
      stages: [stage("a", 0)],
    });
    expect(conflicted.notice).toBe(CONFLICT_MESSAGE);
  });
});
