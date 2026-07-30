export const REPORT_RANGE_DAYS = [30, 90, 365] as const;

export function normalizeReportRange(value: number): (typeof REPORT_RANGE_DAYS)[number] {
  return REPORT_RANGE_DAYS.includes(value as (typeof REPORT_RANGE_DAYS)[number])
    ? (value as (typeof REPORT_RANGE_DAYS)[number])
    : 30;
}
