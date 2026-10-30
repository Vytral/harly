import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Archived stages keep history and old applications, but they are no longer part
 * of a job's pipeline: boards, pickers, progress lists and entry-stage logic must
 * not offer them. Any query that LISTS stages (orders by stage position) has to
 * exclude archived stages or go through `listActiveJobStages`.
 *
 * Looking a stage up by id is deliberately not covered: history, saved
 * automations and an application's current stage may all point at an archived
 * stage and must still resolve.
 */

const SRC_ROOT = path.resolve(__dirname, "../..");

/** File (relative to src) -> why listing every stage, archived included, is correct. */
const ALLOWLIST: Record<string, string> = {
  "features/pipeline/stage-lifecycle.ts":
    "The lifecycle service must see archived stages to validate merges and show history.",
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      sourceFiles(full, out);
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec|integration\.test)\./.test(name) &&
      !name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

type Violation = { file: string; line: number };

export function findUnfilteredStageListings(source: string): number[] {
  const lines: number[] = [];
  const re = /\.from\(jobStages\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const start = match.index;
    const semicolon = source.indexOf(";", start);
    const end = semicolon === -1 ? start + 900 : Math.min(semicolon, start + 900);
    const after = source.slice(start, end);
    const window = source.slice(Math.max(0, start - 900), end);
    const lists = /orderBy\([^)]*jobStages\.order/.test(after);
    const filtered = /archivedAt|archived_at|listActiveJobStages|activeStages\(/.test(window);
    if (lists && !filtered) lines.push(source.slice(0, start).split("\n").length);
  }
  return lines;
}

describe("archived stage guard", () => {
  it("every query that lists a job's stages excludes archived ones", () => {
    const violations: Violation[] = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const rel = path.relative(SRC_ROOT, file).split(path.sep).join("/");
      if (ALLOWLIST[rel]) continue;
      for (const line of findUnfilteredStageListings(readFileSync(file, "utf8"))) {
        violations.push({ file: rel, line });
      }
    }
    expect(
      violations,
      `These queries list pipeline stages without excluding archived ones. ` +
        `Add isNull(jobStages.archivedAt) (or use listActiveJobStages), or allow-list the file with a reason:\n` +
        violations.map((v) => `  ${v.file}:${v.line}`).join("\n"),
    ).toEqual([]);
  });

  it("detects an unfiltered listing and accepts filtered ones", () => {
    const bad = `const rows = await db.select().from(jobStages).where(eq(jobStages.jobId, id)).orderBy(asc(jobStages.order));`;
    const good = `const rows = await db.select().from(jobStages).where(and(eq(jobStages.jobId, id), isNull(jobStages.archivedAt))).orderBy(asc(jobStages.order));`;
    const byId = `const [row] = await db.select().from(jobStages).where(eq(jobStages.id, id)).limit(1);`;
    expect(findUnfilteredStageListings(bad)).toHaveLength(1);
    expect(findUnfilteredStageListings(good)).toHaveLength(0);
    expect(findUnfilteredStageListings(byId)).toHaveLength(0);
  });

  it("keeps the allowlist honest: every entry still exists", () => {
    for (const rel of Object.keys(ALLOWLIST)) {
      expect(() => statSync(path.join(SRC_ROOT, rel))).not.toThrow();
    }
  });
});
