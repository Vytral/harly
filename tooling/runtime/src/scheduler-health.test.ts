import { describe, expect, it } from "vitest";

import {
  describeSchedulerRuns,
  FRESH_RUN_STATUSES,
  sanitizeRunError,
  shouldRecordSchedulerFallback,
} from "./scheduler-health";

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

describe("scheduler run freshness", () => {
  it("counts only succeeded runs as fresh, never a skipped (409) tick", () => {
    expect(FRESH_RUN_STATUSES).toEqual(["succeeded", "success"]);
    expect(FRESH_RUN_STATUSES).not.toContain("skipped");
  });
});

describe("scheduler fallback run rows", () => {
  it("does not write a failed fallback when the fetch timed out, because the app may still record its own result", () => {
    expect(shouldRecordSchedulerFallback({ timedOut: true, appRecorded: false })).toBe(false);
  });

  it("writes the fallback for an unreachable app that recorded nothing", () => {
    expect(shouldRecordSchedulerFallback({ timedOut: false, appRecorded: false })).toBe(true);
  });

  it("never writes a fallback once the app has recorded the run", () => {
    expect(shouldRecordSchedulerFallback({ timedOut: false, appRecorded: true })).toBe(false);
  });
});

describe("sanitizeRunError", () => {
  it("drops drizzle's params section and any email addresses", () => {
    const text = sanitizeRunError(
      'Failed query: update "email_outbox" set "last_error" = $1\nparams: casey@example.test, secret',
    );
    expect(text).not.toContain("params");
    expect(text).not.toContain("casey@example.test");
    expect(text).toContain("Failed query");
  });

  it("keeps a short single-line message intact", () => {
    expect(sanitizeRunError("HTTP 500")).toBe("HTTP 500");
  });
});
