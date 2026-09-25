import { describe, expect, it } from "vitest";

import { nextLocalDeadline } from "./worker";

describe("nextLocalDeadline", () => {
  it("resolves a valid local time across a spring-forward transition", () => {
    const deadline = nextLocalDeadline(
      "03:30",
      "America/New_York",
      new Date("2026-03-08T06:30:00.000Z"),
    );

    expect(deadline.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("skips a local time that does not exist during spring-forward", () => {
    const deadline = nextLocalDeadline(
      "02:30",
      "America/New_York",
      new Date("2026-03-08T01:00:00.000Z"),
    );

    expect(deadline.toISOString()).toBe("2026-03-09T06:30:00.000Z");
  });
});
