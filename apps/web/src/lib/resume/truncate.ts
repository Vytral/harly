export type TruncationResult = {
  text: string;
  truncated: boolean;
  originalLength: number;
  keptLength: number;
};

/**
 * Cut `text` to at most `maxChars`, preferring a line boundary so a role or
 * sentence is never sliced mid-line. Falls back to a hard cut only when the
 * first `maxChars` contain no newline in their back half (one giant line).
 * Callers must record `truncated` in their diagnostics instead of cutting
 * silently.
 */
export function truncateAtLine(text: string, maxChars: number): TruncationResult {
  if (text.length <= maxChars) {
    return { text, truncated: false, originalLength: text.length, keptLength: text.length };
  }
  const window = text.slice(0, maxChars);
  // Only accept a boundary reasonably near the limit, so one long line at the
  // top doesn't throw away most of the budget.
  const lastBreak = window.lastIndexOf("\n");
  const cut = lastBreak >= maxChars * 0.5 ? lastBreak : maxChars;
  const kept = window.slice(0, cut).trimEnd();
  return { text: kept, truncated: true, originalLength: text.length, keptLength: kept.length };
}

export function truncationDiagnostic(label: string, result: TruncationResult): string {
  return `${label} truncated: kept ${result.keptLength} of ${result.originalLength} characters`;
}
