import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `pine` resolves to near-ink in light mode and to near-white in dark mode, so
 * a solid `bg-pine` surface with `text-white` text is invisible in dark mode.
 * Solid actions must use `bg-primary text-primary-foreground` instead.
 *
 * The auth, setup and enter layouts are wrapped in `.light`, which keeps pine
 * dark there, so their brand panels are allowed to pair the two.
 */
const LIGHT_SCOPED_FILES = new Set([
  "app/(public)/enter/_components/enter-brand-panel.tsx",
  "app/(public)/setup/SetupBrandPanel.tsx",
]);

const SOLID_PINE = /(^|[\s"'`])bg-pine(?![\w/-])/;
const WHITE_TEXT = /(^|[\s"'`])text-white(?![\w/-])/;
const WINDOW_LINES = 3;

/**
 * Returns the 1-based line numbers of `bg-pine` class usages whose class list
 * (the lines within a few lines of it) also sets `text-white`.
 */
export function findSolidPineWithWhiteText(source: string): number[] {
  const lines = source.split("\n");
  const hits: number[] = [];
  lines.forEach((line, index) => {
    if (!SOLID_PINE.test(line)) return;
    const from = Math.max(0, index - WINDOW_LINES);
    const to = Math.min(lines.length, index + WINDOW_LINES + 1);
    const window = lines.slice(from, to).join("\n");
    if (WHITE_TEXT.test(window)) hits.push(index + 1);
  });
  return hits;
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return path.endsWith(".tsx") && !path.endsWith(".test.tsx") ? [path] : [];
  });
}

describe("findSolidPineWithWhiteText", () => {
  it("flags a solid pine button with white text, even across lines", () => {
    const source = [
      "const cls = cn(",
      '  "inline-flex rounded-lg bg-pine px-5 py-2.5",',
      '  "text-sm font-semibold text-white shadow-sm",',
      ")",
    ].join("\n");
    expect(findSolidPineWithWhiteText(source)).toEqual([2]);
  });

  it("accepts the semantic primary pairing and translucent or hover-only pine", () => {
    const source = [
      '<button className="bg-primary text-primary-foreground hover:bg-primary/90" />',
      '<span className="rounded-full bg-pine/10 text-pine" />',
      '<span className="hover:bg-pine-strong text-white" />',
    ].join("\n");
    expect(findSolidPineWithWhiteText(source)).toEqual([]);
  });
});

describe("solid pine surfaces in the app", () => {
  it("never pair bg-pine with text-white outside the light-scoped brand panels", () => {
    const srcRoot = fileURLToPath(new URL("../../", import.meta.url));
    const offenders: string[] = [];
    for (const file of listSourceFiles(srcRoot)) {
      const rel = relative(srcRoot, file).split("\\").join("/");
      if (LIGHT_SCOPED_FILES.has(rel)) continue;
      const hits = findSolidPineWithWhiteText(readFileSync(file, "utf8"));
      for (const line of hits) offenders.push(`${rel}:${line}`);
    }
    expect(offenders).toEqual([]);
  });
});
