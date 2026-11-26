/**
 * Month inputs only take `YYYY-MM` with a year above zero, while the API and
 * importers also store `YYYY-MM-DD` and year-only values. Dates a month input
 * cannot show fall back to a plain text input so a stored value is never
 * displayed as blank.
 */
export function dateFieldProps(value: string | null): { type: "month" | "text"; value: string } {
  const raw = value ?? "";
  const match = raw.match(
    /^(?!0000)(\d{4})-(0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/,
  );
  if (match) return { type: "month", value: `${match[1]}-${match[2]}` };
  return { type: raw === "" ? "month" : "text", value: raw };
}
