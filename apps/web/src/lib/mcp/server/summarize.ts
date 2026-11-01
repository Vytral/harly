/** Argument names whose values are free text or contact data: record only their length. */
const FREE_TEXT_KEY = /body|content|text|html|message|note|comment|description|resume|email|phone|answer|reason|subject|summary|feedback/i;

/**
 * A short, PII-light description of a call's arguments for the audit trail:
 * ids and short scalars as given, free text as its length, lists as counts.
 */
export function summarizeArgs(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(0, 25)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      summary[key] = FREE_TEXT_KEY.test(key) || value.length > 80 ? `[${value.length} chars]` : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      summary[key] = value;
    } else if (Array.isArray(value)) {
      summary[key] = `[${value.length} items]`;
    } else {
      summary[key] = "[object]";
    }
  }
  return summary;
}
