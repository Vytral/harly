import { describe, expect, it } from "vitest";

import { describeSchedulerRuns } from "./scheduler-health";

describe("describeSchedulerRuns", () => {
  const now = Date.parse("2026-07-29T04:00:00.000Z");

  it("does not mark a daily job stale after five minutes", () => {
    const result = describeSchedulerRuns(
      [{ name: "daily-reconciliation", intervalMs: 86_400_000 }],
      { "daily-reconciliation": "2026-07-28T04:30:00.000Z" },
      300_000,
      now,
    );

    expect(result.ok).toBe(true);
    expect(result.detail).not.toContain("stale");
  });

  it("still detects a frequent job that stopped running", () => {
    const result = describeSchedulerRuns(
      [{ name: "minute-job", intervalMs: 60_000 }],
      { "minute-job": "2026-07-29T03:54:00.000Z" },
      300_000,
      now,
    );

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("minute-job=");
    expect(result.detail).toContain("(stale)");
  });
});
