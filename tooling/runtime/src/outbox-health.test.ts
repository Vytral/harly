import { describe, expect, it } from "vitest";

import { evaluateEmailOutboxHealth, EMAIL_OUTBOX_THRESHOLDS } from "./outbox-health";

describe("evaluateEmailOutboxHealth", () => {
  it("reports the counts without a warning below every threshold", () => {
    const health = evaluateEmailOutboxHealth({ failed: 2, overduePending: 3, stuckProcessing: 0 });
    expect(health.warn).toBe(false);
    expect(health.detail).toBe("failed=2 overdue_pending=3 stuck_processing=0");
  });

  it("warns when failed rows exceed the threshold", () => {
    const health = evaluateEmailOutboxHealth({
      failed: EMAIL_OUTBOX_THRESHOLDS.failed + 1,
      overduePending: 0,
      stuckProcessing: 0,
    });
    expect(health.warn).toBe(true);
    expect(health.detail).toContain("failed above");
    expect(health.detail).toContain("Delivery log");
  });

  it("warns on any stuck processing row, since a stalled lock is never normal", () => {
    expect(
      evaluateEmailOutboxHealth({ failed: 0, overduePending: 0, stuckProcessing: 1 }).warn,
    ).toBe(true);
  });

  it("does not warn exactly at the threshold", () => {
    expect(
      evaluateEmailOutboxHealth({
        failed: EMAIL_OUTBOX_THRESHOLDS.failed,
        overduePending: EMAIL_OUTBOX_THRESHOLDS.overduePending,
        stuckProcessing: 0,
      }).warn,
    ).toBe(false);
  });
});
