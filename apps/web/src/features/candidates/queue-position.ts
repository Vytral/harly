/**
 * Where the current candidate sits in an ordered list (a review queue, a
 * filtered directory, a pipeline). Pure and client-safe.
 */

export type QueueEntry = {
  candidateId: string;
  applicationId: string | null;
  name: string;
};

export type QueuePosition<T extends QueueEntry = QueueEntry> = {
  /** 1-based; null when the current candidate is not in the list (any more). */
  position: number | null;
  total: number;
  prev: T | null;
  next: T | null;
};

/**
 * Locates the current entry, preferring the exact application (a candidate can
 * sit in a queue once per application) and falling back to the candidate's
 * first entry. When the candidate is not in the list (for example: already
 * reviewed), "next" is the head of the list so the reviewer can carry on.
 */
export function locateInQueue<T extends QueueEntry>(
  items: readonly T[],
  current: { candidateId: string; applicationId?: string | null },
): QueuePosition<T> {
  let index = current.applicationId
    ? items.findIndex(
        (item) =>
          item.applicationId === current.applicationId &&
          item.candidateId === current.candidateId,
      )
    : -1;
  if (index < 0) index = items.findIndex((item) => item.candidateId === current.candidateId);

  if (index < 0) {
    return { position: null, total: items.length, prev: null, next: items[0] ?? null };
  }
  return {
    position: index + 1,
    total: items.length,
    prev: items[index - 1] ?? null,
    next: items[index + 1] ?? null,
  };
}

/** "Moved Charlotte to Interview · Next: Carlos" (first names keep it short). */
export function advanceMessage(action: string, nextName: string | null): string {
  const next = nextName ? firstName(nextName) : null;
  return next ? `${action} · Next: ${next}` : `${action} · Queue cleared`;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
