import { describe, expect, it } from "vitest";

import {
  NO_SHOWN_UI_BLOCKS,
  nextShownUiBlocks,
  renderableUiBlocks,
  streamedUiBlocks,
} from "./ui-blocks-schema";

const note = { kind: "note", tone: "info", text: "Two interviews today." };
const tasks = {
  kind: "task_list",
  items: [{ title: "Give feedback on Priya" }, { title: "Prepare panel" }],
};

describe("renderableUiBlocks", () => {
  it("returns every block of a complete input", () => {
    expect(renderableUiBlocks({ blocks: [note, tasks] })).toHaveLength(2);
  });

  it("keeps the finished blocks while the next one is still streaming", () => {
    // The second block has no items yet: the whole input is invalid, but the
    // first block must still render instead of the card vanishing.
    const streaming = { blocks: [note, { kind: "task_list", items: [] }] };
    expect(renderableUiBlocks(streaming)).toEqual([note]);
  });

  it("stops at the first incomplete block", () => {
    const streaming = { blocks: [note, { kind: "note", tone: "info" }, tasks] };
    expect(renderableUiBlocks(streaming)).toEqual([note]);
  });

  it("renders nothing for input without a blocks array", () => {
    expect(renderableUiBlocks(undefined)).toEqual([]);
    expect(renderableUiBlocks({})).toEqual([]);
    expect(renderableUiBlocks({ blocks: "x" })).toEqual([]);
  });

  it("never returns more than the schema allows", () => {
    expect(renderableUiBlocks({ blocks: Array(9).fill(note) })).toHaveLength(6);
  });
});

describe("streamedUiBlocks", () => {
  it("marks a valid input complete and a partial one incomplete", () => {
    expect(streamedUiBlocks({ blocks: [note] }).complete).toBe(true);
    expect(streamedUiBlocks({ blocks: [note, { kind: "note" }] })).toEqual({
      blocks: [note],
      complete: false,
    });
  });
});

describe("nextShownUiBlocks (streaming card retention)", () => {
  const candidates = (names: string[]) => ({
    kind: "task_list",
    items: names.map((title) => ({ title })),
  });

  it("keeps finished cards through a half-written item, then shows the final input", () => {
    // 1. Two valid blocks render.
    let shown = nextShownUiBlocks(NO_SHOWN_UI_BLOCKS, { blocks: [note, candidates(["A"])] });
    expect(shown.blocks).toHaveLength(2);
    const firstRender = shown;

    // 2. A new item is half-written: the second block fails validation for a
    //    token. Nothing already shown may disappear.
    shown = nextShownUiBlocks(shown, { blocks: [note, { kind: "task_list", items: [{ title: "A" }, {}] }] });
    expect(shown).toBe(firstRender);

    // 3. The input completes with different content: it replaces what was kept.
    shown = nextShownUiBlocks(shown, { blocks: [note, candidates(["A", "B"])] });
    expect(shown).not.toBe(firstRender);
    expect(shown.blocks[1]).toEqual(candidates(["A", "B"]));
  });

  it("lets a complete input shrink what is shown", () => {
    const shown = nextShownUiBlocks(NO_SHOWN_UI_BLOCKS, { blocks: [note, tasks] });
    expect(nextShownUiBlocks(shown, { blocks: [note] }).blocks).toEqual([note]);
  });

  it("returns the same object when nothing changed, so the component does not re-set state", () => {
    const shown = nextShownUiBlocks(NO_SHOWN_UI_BLOCKS, { blocks: [note] });
    expect(nextShownUiBlocks(shown, { blocks: [note] })).toBe(shown);
  });
});
