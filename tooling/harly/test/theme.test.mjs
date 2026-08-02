import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// theme.ts reads its environment once at module load, so each variant is
// exercised in a fresh process rather than by mutating process.env.
const packageRoot = path.resolve(import.meta.dirname, "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "harly-theme-"));
const bundle = path.join(temp, "theme.mjs");
const build = spawnSync(
  "npx",
  [
    "esbuild",
    path.join(packageRoot, "src", "theme.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node20",
    `--outfile=${bundle}`,
  ],
  { cwd: packageRoot, encoding: "utf8" },
);
assert.equal(build.status, 0, build.stderr);

test.after(() => rm(temp, { recursive: true, force: true }));

/** Evaluates an expression against theme.ts under a chosen environment. */
function evaluate(expression, env = {}) {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `
      const theme = await import(${JSON.stringify(bundle)});
      const { mark, icon, rows, humanBytes } = theme;
      process.stdout.write(String(${expression}));
    `],
    { encoding: "utf8", env: { ...process.env, ...env } },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const strip = (value) => value.replace(/\[[0-9;]*m/g, "");

test("the detail column aligns regardless of label width", () => {
  const output = strip(
    evaluate(
      `rows([
        { label: "Version", detail: "left" },
        { label: "A much longer label", detail: "right" },
      ]).join("\\n")`,
      { FORCE_COLOR: "1" },
    ),
  );
  const [first, second] = output.split("\n");
  assert.equal(
    first.indexOf("left"),
    second.indexOf("right"),
    `detail column is not aligned:\n${output}`,
  );
});

test("alignment survives labels that arrive already coloured", () => {
  // Padding on a string containing ANSI escapes pads the escape bytes too,
  // which is what silently bends a column out of true.
  const output = strip(
    evaluate(
      `(() => {
        const { accent } = theme;
        return rows([
          { label: accent("harly doctor"), detail: "one" },
          { label: "plain", detail: "two" },
        ]).join("\\n");
      })()`,
      { FORCE_COLOR: "3", COLORTERM: "truecolor" },
    ),
  );
  const [first, second] = output.split("\n");
  assert.equal(
    first.indexOf("one"),
    second.indexOf("two"),
    `ANSI-coloured label broke alignment:\n${output}`,
  );
});

test("HARLY_ASCII=1 replaces box-drawing glyphs for terminals without coverage", () => {
  const ascii = evaluate(`mark.ok() + "|" + icon.database()`, {
    HARLY_ASCII: "1",
    FORCE_COLOR: "1",
  });
  assert.match(strip(ascii), /^OK\|-$/);
});

test("glyphs survive NO_COLOR: colour support and glyph coverage are separate", () => {
  // A terminal under NO_COLOR, or a pipe into a log file, renders Unicode
  // perfectly well. Only a missing font cannot, and that is HARLY_ASCII's job.
  const output = evaluate(`mark.ok() + "|" + icon.database()`, {
    NO_COLOR: "1",
  });
  assert.equal(output, "✓|▤");
});

test("status marks are never colour-only", () => {
  const plain = strip(
    evaluate(`[mark.ok(), mark.warn(), mark.fail()].join(" ")`, {
      NO_COLOR: "1",
    }),
  );
  assert.equal(plain, "✓ ⚠ ✗");
});

test("a small but real file never reports as 0 MB", () => {
  assert.equal(evaluate("humanBytes(1024 * 400)"), "400 KB");
  assert.equal(evaluate("humanBytes(900)"), "900 B");
  assert.equal(evaluate("humanBytes(1024 ** 2 * 124)"), "124 MB");
  assert.equal(evaluate("humanBytes(1024 ** 3 * 1.5)"), "1.5 GB");
});
