import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Every cron route that records a failed run must say why. The run table keeps
// a sanitized error line, and an empty `failed` row is useless to operators.

const CRON_ROOT = join(__dirname);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return entry === "route.ts" ? [path] : [];
  });
}

/** Argument list of each `run.finish("failed", ...)` call, split at top-level commas. */
function failedFinishCalls(source: string): string[][] {
  const calls: string[][] = [];
  const marker = /\.finish\(\s*"failed"/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(source)) !== null) {
    let depth = 1;
    let index = match.index + match[0].length;
    const args: string[] = [];
    let current = "";
    while (index < source.length && depth > 0) {
      const char = source[index];
      if ("([{".includes(char)) depth += 1;
      if (")]}".includes(char)) depth -= 1;
      if (depth === 0) break;
      if (char === "," && depth === 1) {
        args.push(current.trim());
        current = "";
      } else {
        current += char;
      }
      index += 1;
    }
    if (current.trim()) args.push(current.trim());
    calls.push(args);
  }
  return calls;
}

describe("cron routes finish failed runs with an error", () => {
  const files = routeFiles(CRON_ROOT);

  it("finds the cron routes", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => [relative(CRON_ROOT, file), file]))(
    "%s passes an error argument to every failed finish",
    (_name, file) => {
      const calls = failedFinishCalls(readFileSync(file, "utf8"));
      for (const args of calls) {
        // Arguments: status, counters, error. The error must be a third argument.
        expect(args.length, `finish("failed") without an error in ${file}`).toBeGreaterThanOrEqual(3);
        expect(args[2]).not.toBe("undefined");
      }
    },
  );
});
