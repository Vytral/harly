/**
 * Pure rules for reporting AI provider calls to integration health. Kept free
 * of server-only imports so they are unit-tested directly.
 */

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  for (const value of [record.statusCode, record.status]) {
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }
  return null;
}

/**
 * A caller cancelled the request (navigation, closed chat). Not a provider
 * failure, so it is not recorded. Timeouts (`TimeoutError`) still are.
 */
export function isCallerAbort(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * The provider rejected the request itself: unknown model, unsupported
 * parameter, invalid schema. Every later call fails the same way, so the
 * workspace is put in the error state on the first failure instead of after
 * the usual streak. 401 and 429 are classified by the health model.
 */
export function aiFailureForceState(error: unknown): "error" | undefined {
  const status = statusOf(error);
  return status === 400 || status === 404 || status === 422 ? "error" : undefined;
}
