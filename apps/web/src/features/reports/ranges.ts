export const REPORT_RANGE_DAYS = [30, 90, 365] as const;

export type ReportRangeDays = (typeof REPORT_RANGE_DAYS)[number];

export function normalizeReportRange(value: number): ReportRangeDays {
  return REPORT_RANGE_DAYS.includes(value as ReportRangeDays)
    ? (value as ReportRangeDays)
    : 30;
}

/** The label every card uses for the selected range, e.g. "Last 30 days". */
export function reportRangeLabel(days: number): string {
  return days === 365 ? "Last 12 months" : `Last ${days} days`;
}
