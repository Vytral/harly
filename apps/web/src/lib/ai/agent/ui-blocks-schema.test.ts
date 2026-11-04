import { describe, expect, it } from "vitest";

import { renderableUiBlocks } from "./ui-blocks-schema";

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
