export const ACTIVE_POOL_ENTRY_CONFLICT_MESSAGE = "Candidate is already in the pool.";

const ACTIVE_POOL_ENTRY_CONSTRAINT = "pool_entries_active_workspace_candidate_idx";

export function isActivePoolEntryUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const details = error as {
    code?: unknown;
    constraint?: unknown;
    constraint_name?: unknown;
  };
  const constraint = details.constraint ?? details.constraint_name;
  return (
    details.code === "23505" &&
    (constraint == null || constraint === ACTIVE_POOL_ENTRY_CONSTRAINT)
  );
}
