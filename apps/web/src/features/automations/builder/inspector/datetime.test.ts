import { describe, expect, it } from "vitest";

import { formatDateTimeLocal } from "./datetime";

describe("formatDateTimeLocal", () => {
  it("formats valid ISO values for a local datetime input", () => {
    const value = formatDateTimeLocal("2026-09-11T12:34:56.000Z");
    const date = new Date("2026-09-11T12:34:56.000Z");
    const pad = (part: number) => String(part).padStart(2, "0");
    expect(value).toBe(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`,
    );
  });

  it("does not create a misleading value for empty or invalid input", () => {
    expect(formatDateTimeLocal(undefined)).toBe("");
    expect(formatDateTimeLocal("not-a-date")).toBe("");
  });
});
