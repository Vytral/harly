/** Edit distance with transpositions, so `dcotor` is one typo from `doctor`. */
export function editDistance(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}

/** Words people reach for that name an existing command. */
export const commandAliases: Record<string, string> = {
  install: "init",
  setup: "init",
  start: "launch",
  up: "launch",
  run: "launch",
  health: "doctor",
  healthcheck: "doctor",
  info: "status",
  secret: "setup-secret",
  remove: "uninstall",
  delete: "uninstall",
  stop: "uninstall",
  rollback: "restore",
  global: "install-global",
  "self-install": "install-global",
};

/**
 * Closest candidates to a mistyped word, best first. A prefix (`back`) or a
 * known alias (`install`) counts as a match even when it is far in edit
 * distance; otherwise the allowed distance scales with the word's length so a
 * three-letter typo does not match everything.
 */
export function suggest(
  input: string,
  candidates: readonly string[],
  options: { aliases?: Record<string, string>; limit?: number } = {},
): string[] {
  const word = input.trim().toLowerCase().replace(/^-+/, "");
  if (!word) return [];
  const limit = options.limit ?? 3;
  const pool = candidates.map((candidate) => ({
    candidate,
    bare: candidate.toLowerCase().replace(/^-+/, ""),
  }));
  const scored = new Map<string, number>();
  const aliased = options.aliases?.[word];
  if (aliased) {
    const hit = pool.find((entry) => entry.bare === aliased);
    if (hit) scored.set(hit.candidate, -1);
  }
  const allowed = Math.max(1, Math.min(3, Math.floor(word.length / 3)));
  for (const { candidate, bare } of pool) {
    if (scored.has(candidate)) continue;
    const distance = editDistance(word, bare);
    if (bare.startsWith(word) && word.length >= 2) scored.set(candidate, 0.5);
    else if (distance <= allowed) scored.set(candidate, distance);
  }
  return [...scored.entries()]
    .sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0]))
    .slice(0, limit)
    .map(([candidate]) => candidate);
}

/** `Did you mean harly doctor?` or an empty string when nothing is close. */
export function didYouMean(matches: readonly string[], format = (value: string) => value): string {
  if (matches.length === 0) return "";
  if (matches.length === 1) return `Did you mean ${format(matches[0]!)}?`;
  return `Did you mean ${matches.slice(0, -1).map(format).join(", ")} or ${format(matches.at(-1)!)}?`;
}
