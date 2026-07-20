import { describe, expect, it } from "vitest";

import { currentTaskDateKey, taskDateKey, taskDueState } from "./shared";

describe("task date helpers", () => {
  it("keeps date-only values on their intended calendar day", () => {
    expect(taskDateKey("2026-07-20T00:00:00.000Z")).toBe("2026-07-20");
    expect(
      currentTaskDateKey(new Date("2026-07-20T23:30:00.000Z")),
    ).toMatch(/^2026-07-2[01]$/);
  });

  it("classifies due dates relative to the local calendar day", () => {
    const now = new Date("2026-07-20T12:00:00.000Z");

    expect(taskDueState("2026-07-19T00:00:00.000Z", now)).toBe("overdue");
    expect(taskDueState("2026-07-20T00:00:00.000Z", now)).toBe("today");
    expect(taskDueState("2026-07-21T00:00:00.000Z", now)).toBe("soon");
    expect(taskDueState(null, now)).toBeNull();
  });
});
