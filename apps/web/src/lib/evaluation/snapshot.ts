/**
 * Evaluation snapshot fingerprinting — Phase 0 (Audit doc §5).
 *
 * Deterministic, runtime-agnostic hashing for evaluation snapshots.
 * Deliberately dependency-free (no `node:crypto`) so the evaluation lib
 * stays importable from server, edge, and test runtimes.
 *
 * Key ordering uses codepoint comparison (not `localeCompare`, which is
 * locale-dependent) so fingerprints are stable across machines.
 *
 * These are integrity fingerprints for replay/audit identity, not
 * cryptographic hashes. The persist layer (`service.ts`) keeps its own
 * sha256 `inputHash`/`outputHash`; snapshot fingerprints identify the
 * exact inputs that produced an evaluation.
 */

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function cyrb53(input: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Returns a 42-hex-char deterministic fingerprint of any JSON-like value.
 * Identical snapshot inputs always produce identical fingerprints.
 */
export function fingerprintSnapshot(value: unknown): string {
  const json = stableJson(value);
  return [0x9e37, 0x85eb, 0xc2b2]
    .map((seed) => cyrb53(json, seed).toString(16).padStart(14, "0"))
    .join("");
}
