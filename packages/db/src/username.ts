export const RESERVED_USERNAMES = new Set([
  "account",
  "settings",
  "people",
  "admin",
  "api",
  "support",
]);

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
const USERNAME_PATTERN = /^[a-z0-9_-]+$/;

export function isValidUsernameShape(value: string): boolean {
  return (
    value.length >= USERNAME_MIN_LENGTH &&
    value.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(value) &&
    !RESERVED_USERNAMES.has(value)
  );
}

/** NFKD-normalize a name into a lowercase, hyphenated username base (no suffix). */
export function normalizeUsername(input: string): string {
  const normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "member";
}

export type BackfillCandidate = { id: string; name: string };

export type BackfillAssignment = {
  id: string;
  username: string;
  hadConflict: boolean;
};

export type BackfillResult = {
  updated: BackfillAssignment[];
  unresolvable: { id: string; reason: string }[];
};

/**
 * Pure resolver: given candidates lacking a username and the set of
 * usernames already taken (current + historical), returns one unique,
 * schema-valid username per candidate. Mutates `takenUsernames` in place
 * so repeated calls stay collision-free.
 */
export function resolveUsernameAssignments(
  candidates: BackfillCandidate[],
  takenUsernames: Set<string>,
): BackfillResult {
  const updated: BackfillAssignment[] = [];
  const unresolvable: { id: string; reason: string }[] = [];

  for (const candidate of candidates) {
    const base = normalizeUsername(candidate.name).slice(
      0,
      USERNAME_MAX_LENGTH,
    );
    const paddedBase =
      base.length < USERNAME_MIN_LENGTH
        ? base.padEnd(USERNAME_MIN_LENGTH, "0")
        : base;

    let username = paddedBase;
    let attempt = 1;
    let hadConflict = false;
    let resolved =
      isValidUsernameShape(username) && !takenUsernames.has(username);

    while (!resolved) {
      hadConflict = true;
      attempt += 1;
      const suffix = `-${attempt}`;
      const truncatedBase = paddedBase.slice(
        0,
        USERNAME_MAX_LENGTH - suffix.length,
      );
      username = `${truncatedBase}${suffix}`;
      resolved =
        isValidUsernameShape(username) && !takenUsernames.has(username);

      if (attempt > 10000) {
        unresolvable.push({
          id: candidate.id,
          reason: "Could not resolve a unique username.",
        });
        username = "";
        break;
      }
    }

    if (!username) continue;

    takenUsernames.add(username);
    updated.push({ id: candidate.id, username, hadConflict });
  }

  return { updated, unresolvable };
}
