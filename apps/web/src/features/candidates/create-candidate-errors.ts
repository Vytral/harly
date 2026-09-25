type DatabaseErrorDetails = {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
};

/** Match only the workspace-scoped, case-insensitive candidate email index. */
export function isCandidateEmailConflict(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return false;
    const details = current as DatabaseErrorDetails;
    if (
      details.code === "23505" &&
      details.constraint === "candidates_workspace_email_idx"
    ) {
      return true;
    }
    current = details.cause;
  }
  return false;
}
