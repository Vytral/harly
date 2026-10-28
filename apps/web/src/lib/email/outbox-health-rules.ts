/**
 * Thresholds for email outbox warnings. Mirrors tooling/runtime/src/outbox-health.ts
 * (the runtime container cannot import app code). Keep the two in step.
 */
export type EmailOutboxCounts = {
  failed: number;
  overduePending: number;
  stuckProcessing: number;
};

export const EMAIL_OUTBOX_THRESHOLDS: EmailOutboxCounts = {
  failed: 10,
  overduePending: 25,
  stuckProcessing: 0,
};

export function evaluateEmailOutboxHealth(
  counts: EmailOutboxCounts,
  thresholds: EmailOutboxCounts = EMAIL_OUTBOX_THRESHOLDS,
): { warn: boolean } {
  return {
    warn:
      counts.failed > thresholds.failed ||
      counts.overduePending > thresholds.overduePending ||
      counts.stuckProcessing > thresholds.stuckProcessing,
  };
}
