import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the "respect the device theme" rule on access screens: no forced
 * `light`/`dark` wrapper class and no hardcoded surface colors. Use the
 * semantic tokens (bg-card, bg-paper, text-foreground …) instead.
 * Exceptions must be listed in ALLOW with a reason.
 */
const ROOT = join(__dirname, "..", "app");
const DIRS = [
  "(auth)",
  "(public)/setup",
  "(public)/enter",
  "oauth",
  "no-workspace",
  "setup-2fa",
  "invite",
  "join",
  "change-password",
];

const FORBIDDEN: Array<[string, RegExp]> = [
  ["forced theme class", /className="[^"]*(?:^|\s)(?:light|dark)(?:\s|")/],
  ["bg-white", /(?<![\w-])bg-white(?![\w/-])/],
  ["bg-black", /(?<![\w-])bg-black(?![\w/-])/],
  ["text-black", /(?<![\w-])text-black(?![\w/-])/],
  ["border-gray", /border-gray-/],
  ["bg-gray", /bg-gray-/],
  ["text-gray", /text-gray-/],
];

// file (relative to src/app) -> rule names allowed, with justification.
const ALLOW: Record<string, string[]> = {
  // QR codes must be dark-on-light to scan, regardless of theme.
  "setup-2fa/_components/setup-2fa-form.tsx": ["bg-white"],
  // Brand panels are intentionally fixed evergreen with white text.
  "(public)/setup/SetupBrandPanel.tsx": ["bg-white"],
  "(public)/enter/_components/enter-brand-panel.tsx": ["bg-white"],
};

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.tsx$/.test(e) && !/\.test\./.test(e)) out.push(p);
  }
  return out;
}

describe("access screens respect the device theme", () => {
  const files = DIRS.flatMap((d) => walk(join(ROOT, d)));
  it("scans some files", () => expect(files.length).toBeGreaterThan(5));
  it("has no forced theme or hardcoded surface colors", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f);
      const src = readFileSync(f, "utf8");
      for (const [name, re] of FORBIDDEN) {
        if (ALLOW[rel]?.includes(name)) continue;
        if (re.test(src)) offenders.push(`${rel}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
