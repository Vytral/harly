import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guards the durable-key contract of `enqueueEmailOutbox`: without a `dedupeKey`
 * the outbox dedupes on a hash of the payload, which silently drops a second
 * legitimate event with an identical payload. Every production call site must
 * pass its key as the fourth argument, and it must not be a literal `undefined`
 * or an empty string. This is a source scan, so it has no allow-list.
 */

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CALL = "enqueueEmailOutbox(";

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.test\.tsx?$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

/** Returns the top-level argument texts of the call whose `(` is at `openIndex`. */
function readCallArguments(source: string, openIndex: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  let quote: string | null = null;
  for (let i = openIndex + 1; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quote) {
      current += ch;
      if (ch === "\\") {
        current += source[i + 1] ?? "";
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) {
        if (current.trim()) args.push(current.trim());
        return args;
      }
      depth -= 1;
    }
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  throw new Error("Unterminated enqueueEmailOutbox call.");
}

type CallSite = { file: string; line: number; args: string[] };

function findCallSites(): CallSite[] {
  const sites: CallSite[] = [];
  for (const file of listSourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, "utf8");
    let index = source.indexOf(CALL);
    while (index !== -1) {
      const before = source.slice(Math.max(0, index - 20), index);
      const isDefinition = /function\s+$/.test(before);
      const prev = source[index - 1] ?? "";
      const isIdentifierTail = /[A-Za-z0-9_$.]/.test(prev) && prev !== ".";
      if (!isDefinition && !isIdentifierTail) {
        const line = source.slice(0, index).split("\n").length;
        sites.push({
          file: relative(SRC_ROOT, file),
          line,
          args: readCallArguments(source, index + CALL.length - 1),
        });
      }
      index = source.indexOf(CALL, index + CALL.length);
    }
  }
  return sites;
}

describe("enqueueEmailOutbox call sites pass a durable dedupe key", () => {
  const sites = findCallSites();

  it("finds the production call sites", () => {
    expect(sites.length).toBeGreaterThanOrEqual(10);
  });

  it.each(sites.map((site) => [`${site.file}:${site.line}`, site] as const))(
    "%s passes a dedupeKey",
    (_label, site) => {
      const key = site.args[3];
      expect(key, `${site.file}:${site.line} has no dedupeKey argument`).toBeDefined();
      expect(key).not.toBe("undefined");
      expect(key).not.toBe('""');
      expect(key).not.toBe("''");
    },
  );
});
