import { describe, expect, it } from "vitest";

import { computeScrollTop } from "./scroll";

const base = { rootTop: 100, rootHeight: 600, rootScrollTop: 400 };

describe("computeScrollTop", () => {
  it("returns null when the element is already visible", () => {
    expect(
      computeScrollTop({ ...base, elTop: 200, elBottom: 300, align: "nearest" }),
    ).toBeNull();
  });

  it("scrolls down just enough, keeping the sticky footer clear", () => {
    expect(
      computeScrollTop({
        ...base,
        elTop: 600,
        elBottom: 800,
        align: "nearest",
        bottomInset: 72,
      }),
    ).toBe(400 + (700 - (600 - 72)));
  });

  it("aligns to the start with an inset", () => {
    expect(
      computeScrollTop({ ...base, elTop: 500, elBottom: 600, align: "start", topInset: 16 }),
    ).toBe(400 + 400 - 16);
  });

  it("never scrolls past the top", () => {
    expect(
      computeScrollTop({ ...base, elTop: 90, elBottom: 150, align: "start" }),
    ).toBe(390);
  });

  it("shows the top of an element taller than the viewport", () => {
    const top = computeScrollTop({
      ...base,
      elTop: 300,
      elBottom: 2000,
      align: "nearest",
    });
    // relTop = 200 -> shifts by at most relTop, so its top lands at the root top.
    expect(top).toBe(600);
  });
});
