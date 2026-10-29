import { describe, expect, it } from "vitest";

import { normalizeCronRunCounts, normalizeCronRunStatus, sanitizeCronErrorText } from "./cron-status";

describe("cron run status vocabulary", () => {
  it("maps legacy scheduler and app words onto one vocabulary", () => {
    expect(normalizeCronRunStatus("success")).toBe("succeeded");
    expect(normalizeCronRunStatus("succeeded")).toBe("succeeded");
    expect(normalizeCronRunStatus("failed")).toBe("failed");
    expect(normalizeCronRunStatus("skipped")).toBe("skipped");
  });

  it("rejects unknown words instead of inventing a category", () => {
    expect(normalizeCronRunStatus("running")).toBeNull();
    expect(normalizeCronRunStatus("")).toBeNull();
  });

  it("sums legacy success rows into the succeeded bucket", () => {
    // Legacy `success` rows and current `succeeded` rows count as one outcome.
    // This sums stored rows; it cannot tell apart the two rows a legacy run
    // wrote, so the scheduler stops writing duplicates going forward.
    const merged = normalizeCronRunCounts([
      { job: "email-outbox", status: "success", count: 3 },
      { job: "email-outbox", status: "succeeded", count: 2 },
      { job: "email-outbox", status: "failed", count: 1 },
      { job: "scheduled-reports", status: "skipped", count: 4 },
      { job: "email-outbox", status: "weird", count: 9 },
    ]);
    expect(merged).toEqual([
      { job: "email-outbox", status: "failed", count: 1 },
      { job: "email-outbox", status: "succeeded", count: 5 },
      { job: "scheduled-reports", status: "skipped", count: 4 },
    ]);
  });
});

describe("sanitizeCronErrorText", () => {
  it("strips the parameter list drizzle appends and any email addresses from stored errors", () => {
    const text = sanitizeCronErrorText(
      'Failed query: select * from "candidates" where "email" = $1\nparams: casey@example.test',
    );
    expect(text).toBe('Failed query: select * from "candidates" where "email" = $1');
  });

  it("collapses whitespace and bounds the length", () => {
    expect(sanitizeCronErrorText("boom\n\nbad   thing")).toBe("boom bad thing");
    expect(sanitizeCronErrorText("x".repeat(900)).length).toBeLessThanOrEqual(500);
  });
});
