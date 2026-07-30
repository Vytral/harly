import { describe, expect, it } from "vitest";

import {
  averageTimeToHireDays,
  bucketTimeToHire,
  countEventsBetween,
  timeToHireDays,
  type HiringEvent,
} from "./metrics";
import { normalizeReportRange } from "./ranges";

const event = (applicationId: string, appliedAt: string, hiredAt: string): HiringEvent => ({
  applicationId,
  appliedAt,
  hiredAt,
});

describe("report hiring metrics", () => {
  it("normalizes unsupported report windows to the safe default", () => {
    expect(normalizeReportRange(90)).toBe(90);
    expect(normalizeReportRange(7)).toBe(30);
    expect(normalizeReportRange(Number.NaN)).toBe(30);
  });
  it("measures time to hire from application to the Hired transition", () => {
    expect(
      timeToHireDays(
        event("app-1", "2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z"),
      ),
    ).toBe(30);
  });

  it("ignores invalid negative time-to-hire values", () => {
    expect(
      timeToHireDays(
        event("app-1", "2026-02-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(averageTimeToHireDays([])).toBeNull();
  });

  it("buckets hires using the event date and application date", () => {
    const events = [
      event("app-1", "2026-01-01T00:00:00.000Z", "2026-01-10T00:00:00.000Z"),
      event("app-2", "2026-01-01T00:00:00.000Z", "2026-02-20T00:00:00.000Z"),
      event("app-3", "2026-01-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z"),
    ];

    expect(bucketTimeToHire(events)).toEqual([
      { bucket: "0–14d", count: 1 },
      { bucket: "15–30d", count: 0 },
      { bucket: "31–60d", count: 1 },
      { bucket: "61–90d", count: 0 },
      { bucket: "90d+", count: 1 },
    ]);
  });

  it("counts unique hiring events inside a reporting window", () => {
    const events = [
      event("app-1", "2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"),
      event("app-2", "2026-01-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"),
    ];

    expect(
      countEventsBetween(
        events,
        new Date("2026-02-01T00:00:00.000Z"),
        new Date("2026-03-01T00:00:00.000Z"),
      ),
    ).toBe(1);
  });
});
