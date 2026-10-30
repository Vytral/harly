import { describe, expect, it } from "vitest";

import { nextEnabledIndex } from "@/components/ui/segmented-control";

describe("nextEnabledIndex", () => {
  const all = [true, true, true];

  it("moves right and left with the arrow keys", () => {
    expect(nextEnabledIndex(0, "ArrowRight", all)).toBe(1);
    expect(nextEnabledIndex(1, "ArrowLeft", all)).toBe(0);
    expect(nextEnabledIndex(0, "ArrowDown", all)).toBe(1);
    expect(nextEnabledIndex(1, "ArrowUp", all)).toBe(0);
  });

  it("wraps at both ends", () => {
    expect(nextEnabledIndex(2, "ArrowRight", all)).toBe(0);
    expect(nextEnabledIndex(0, "ArrowLeft", all)).toBe(2);
  });

  it("jumps to the first and last enabled option with Home and End", () => {
    expect(nextEnabledIndex(1, "Home", all)).toBe(0);
    expect(nextEnabledIndex(1, "End", all)).toBe(2);
  });

  it("skips disabled options", () => {
    const middleDisabled = [true, false, true];
    expect(nextEnabledIndex(0, "ArrowRight", middleDisabled)).toBe(2);
    expect(nextEnabledIndex(2, "ArrowLeft", middleDisabled)).toBe(0);
    expect(nextEnabledIndex(0, "End", [true, true, false])).toBe(1);
  });

  it("returns null for non-navigation keys and for a lone enabled option", () => {
    expect(nextEnabledIndex(0, "Enter", all)).toBeNull();
    expect(nextEnabledIndex(0, "a", all)).toBeNull();
    expect(nextEnabledIndex(0, "ArrowRight", [true, false, false])).toBeNull();
    expect(nextEnabledIndex(0, "ArrowRight", [])).toBeNull();
  });
});
