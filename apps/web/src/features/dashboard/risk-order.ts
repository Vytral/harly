export type RiskSeverity = "critical" | "danger" | "warning";

const RISK_SEVERITY_RANK: Record<RiskSeverity, number> = { critical: 0, danger: 1, warning: 2 };

/**
 * Most severe first. Within one severity the input order is kept (the caller
 * passes jobs oldest first), so the widget's top few are the worst, not merely
 * the oldest.
 */
export function rankRiskJobs<T extends { severity: RiskSeverity }>(jobs: readonly T[]): T[] {
  return jobs
    .map((job, index) => ({ job, index }))
    .sort((a, b) => RISK_SEVERITY_RANK[a.job.severity] - RISK_SEVERITY_RANK[b.job.severity] || a.index - b.index)
    .map(({ job }) => job);
}
