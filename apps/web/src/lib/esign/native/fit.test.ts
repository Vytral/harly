import { describe, expect, it } from "vitest";

import { fitContain, fitContainOnPage } from "./fit";

describe("fitContain", () => {
  it("letterboxes a wide mark inside a square box", () => {
    const fitted = fitContain({ x: 0, y: 0, w: 100, h: 100 }, 4);
    expect(fitted.w).toBe(100);
    expect(fitted.h).toBe(25);
    expect(fitted.x).toBe(0);
    expect(fitted.y).toBe(37.5);
  });

  it("letterboxes a tall mark inside a wide box", () => {
    const fitted = fitContain({ x: 10, y: 20, w: 200, h: 40 }, 0.5);
    expect(fitted.w).toBe(20);
    expect(fitted.h).toBe(40);
    expect(fitted.x).toBe(100);
    expect(fitted.y).toBe(20);
  });
});

describe("fitContainOnPage", () => {
  it("uses page points, not raw fractions, so a square fraction box is not square on letter paper", () => {
    const fitted = fitContainOnPage(
      { x: 0.1, y: 0.2, w: 0.2, h: 0.2 },
      600,
      800,
      700 / 180,
    );
    const boxW = 0.2 * 600;
    const boxH = 0.2 * 800;
    expect(fitted.w / fitted.h).toBeCloseTo(700 / 180, 5);
    expect(fitted.w).toBeLessThanOrEqual(boxW + 0.001);
    expect(fitted.h).toBeLessThanOrEqual(boxH + 0.001);
    expect(fitted.w).toBeCloseTo(boxW, 5);
    expect(fitted.h).toBeLessThan(boxH);
  });
});
