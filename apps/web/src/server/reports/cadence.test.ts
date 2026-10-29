import { describe, expect, it } from "vitest";

import { addUtcMonths, nextRun } from "./cadence";

const d = (iso: string) => new Date(iso);

describe("scheduled report cadence", () => {
  it("clamps monthly runs to the last day instead of spilling into the next month", () => {
    expect(addUtcMonths(d("2026-01-31T09:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T09:00:00.000Z");
    expect(addUtcMonths(d("2028-01-31T09:00:00.000Z"), 1).toISOString()).toBe("2028-02-29T09:00:00.000Z");
    expect(addUtcMonths(d("2026-03-31T09:00:00.000Z"), 1).toISOString()).toBe("2026-04-30T09:00:00.000Z");
    expect(addUtcMonths(d("2026-12-15T09:00:00.000Z"), 1).toISOString()).toBe("2027-01-15T09:00:00.000Z");
  });

  it("does not drift after a short month", () => {
    // Jan 31 -> Feb 28 -> Mar 28: drift is acceptable, but it must never skip a month.
    const feb = nextRun("monthly", d("2026-01-31T09:00:00.000Z"));
    const mar = nextRun("monthly", feb);
    expect(feb.getUTCMonth()).toBe(1);
    expect(mar.getUTCMonth()).toBe(2);
  });

  it("keeps daily and weekly steps exact", () => {
    expect(nextRun("daily", d("2026-02-28T09:00:00.000Z")).toISOString()).toBe("2026-03-01T09:00:00.000Z");
    expect(nextRun("weekly", d("2026-02-28T09:00:00.000Z")).toISOString()).toBe("2026-03-07T09:00:00.000Z");
  });
});
