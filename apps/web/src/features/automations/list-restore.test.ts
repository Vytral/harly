import { describe, expect, it } from "vitest";

import { restoreAtIndex } from "./list-restore";

describe("restoreAtIndex", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };

  it("puts a removed item back at its original index", () => {
    expect(restoreAtIndex([a, c], 1, b)).toEqual([a, b, c]);
  });

  it("does not duplicate an item that is already present", () => {
    expect(restoreAtIndex([a, b, c], 1, b)).toEqual([a, b, c]);
  });

  it("appends when the original index is past the end", () => {
    expect(restoreAtIndex([a], 9, b)).toEqual([a, b]);
  });
});
