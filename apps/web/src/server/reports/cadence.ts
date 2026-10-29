/** Add calendar months in UTC, clamping to the last day (Jan 31 + 1 month = Feb 28/29, not Mar 3). */
export function addUtcMonths(from: Date, months: number): Date {
  const result = new Date(from);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function nextRun(frequency: string, from = new Date()): Date {
  const result = new Date(from);
  if (frequency === "daily") result.setUTCDate(result.getUTCDate() + 1);
  else if (frequency === "weekly") result.setUTCDate(result.getUTCDate() + 7);
  else return addUtcMonths(from, 1);
  return result;
}
