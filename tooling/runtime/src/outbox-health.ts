export type EmailOutboxCounts = {
  /** Rows that ended `failed` and will not be retried automatically. */
  failed: number;
  /** `pending` rows whose retry (or first attempt) is overdue. */
  overduePending: number;
  /** `processing` rows whose lock is older than the stale-lock window. */
  stuckProcessing: number;
};

export const EMAIL_OUTBOX_THRESHOLDS: EmailOutboxCounts = {
  failed: 10,
  overduePending: 25,
  stuckProcessing: 0,
};

/**
 * Email trouble is a warning, not a runtime failure: a failed candidate email
 * must not make the scheduler container unhealthy. Callers print `warn` and
 * leave the exit code unchanged.
 */
export function evaluateEmailOutboxHealth(
  counts: EmailOutboxCounts,
  thresholds: EmailOutboxCounts = EMAIL_OUTBOX_THRESHOLDS,
): { warn: boolean; detail: string } {
  const summary = `failed=${counts.failed} overdue_pending=${counts.overduePending} stuck_processing=${counts.stuckProcessing}`;
  const problems: string[] = [];
  if (counts.failed > thresholds.failed) {
    problems.push(`failed above ${thresholds.failed}`);
  }
  if (counts.overduePending > thresholds.overduePending) {
    problems.push(`overdue pending above ${thresholds.overduePending}`);
  }
  if (counts.stuckProcessing > thresholds.stuckProcessing) {
    problems.push(`stuck processing above ${thresholds.stuckProcessing}`);
  }
  return {
    warn: problems.length > 0,
    detail:
      problems.length > 0
        ? `${summary} WARNING: ${problems.join("; ")}. Review Settings → Email → Delivery log.`
        : summary,
  };
}
