import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// backups.ts is bundled into dist/index.js and not exported separately, so
// compile just that module to a temp file to exercise it directly.
const packageRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(packageRoot, "dist", "index.js");
const temp = await mkdtemp(path.join(os.tmpdir(), "harly-backups-test-"));
const bundle = path.join(temp, "backups.mjs");
const build = spawnSync(
  "npx",
  [
    "esbuild",
    path.join(packageRoot, "src", "backups.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node20",
    `--outfile=${bundle}`,
  ],
  { cwd: packageRoot, encoding: "utf8" },
);
assert.equal(build.status, 0, build.stderr);
const { AUTOMATIC_BACKUP_KEEP, listBackups, pruneBackups } = await import(bundle);
test.after(() => rm(temp, { recursive: true, force: true }));

/** An installation directory holding archives named oldest first. */
async function installation(names) {
  const directory = await mkdtemp(path.join(temp, "install-"));
  await mkdir(path.join(directory, "backups"));
  await writeFile(path.join(directory, "harly.config.json"), "{}\n");
  for (const [index, name] of names.entries()) {
    const file = path.join(directory, "backups", name);
    await writeFile(file, `archive-${index}`);
    const when = new Date(Date.UTC(2026, 0, 1 + index));
    await utimes(file, when, when);
  }
  return directory;
}

const remaining = async (directory) => (await readdir(path.join(directory, "backups"))).sort();

test("lists archives newest first and tells automatic ones apart", async () => {
  const directory = await installation([
    "harly-2026-01-01.tar.gz",
    "harly-auto-2026-01-02.tar.gz",
    "harly-2026-01-03.tar.gz.age",
    "notes.txt",
  ]);
  const found = await listBackups(directory);
  assert.deepEqual(
    found.map((entry) => [entry.name, entry.automatic]),
    [
      ["harly-2026-01-03.tar.gz.age", false],
      ["harly-auto-2026-01-02.tar.gz", true],
      ["harly-2026-01-01.tar.gz", false],
    ],
  );
  assert.deepEqual(await listBackups(path.join(temp, "missing")), []);
});

test("prune keeps the newest N archives and deletes the rest", async () => {
  const directory = await installation([
    "harly-2026-01-01.tar.gz",
    "harly-auto-2026-01-02.tar.gz",
    "harly-2026-01-03.tar.gz",
  ]);
  const result = await pruneBackups(directory, { keep: 2 });
  assert.deepEqual(result.removed.map((entry) => entry.name), ["harly-2026-01-01.tar.gz"]);
  assert.deepEqual(await remaining(directory), [
    "harly-2026-01-03.tar.gz",
    "harly-auto-2026-01-02.tar.gz",
  ]);
});

test("a dry run deletes nothing", async () => {
  const directory = await installation(["harly-2026-01-01.tar.gz", "harly-2026-01-02.tar.gz"]);
  const result = await pruneBackups(directory, { keep: 1, dryRun: true });
  assert.equal(result.removed.length, 1);
  assert.equal((await remaining(directory)).length, 2);
});

test("capping automatic archives never touches archives written by hand", async () => {
  const names = [
    "harly-2026-01-01.tar.gz",
    ...Array.from({ length: AUTOMATIC_BACKUP_KEEP + 3 }, (_, index) =>
      `harly-auto-2026-02-${String(index + 1).padStart(2, "0")}.tar.gz`,
    ),
  ];
  const directory = await installation(names);
  const result = await pruneBackups(directory, { keep: AUTOMATIC_BACKUP_KEEP, onlyAutomatic: true });
  assert.equal(result.removed.length, 3);
  const left = await remaining(directory);
  assert.ok(left.includes("harly-2026-01-01.tar.gz"));
  assert.equal(left.filter((name) => name.startsWith("harly-auto-")).length, AUTOMATIC_BACKUP_KEEP);
});

test("prune refuses a keep count that would delete everything", async () => {
  const directory = await installation(["harly-2026-01-01.tar.gz"]);
  await assert.rejects(pruneBackups(directory, { keep: 0 }), RangeError);
  assert.equal((await remaining(directory)).length, 1);
});

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
}

test("harly backup prune --keep deletes old archives and reports them", async () => {
  const directory = await installation([
    "harly-2026-01-01.tar.gz",
    "harly-2026-01-02.tar.gz",
    "harly-2026-01-03.tar.gz",
  ]);
  const dry = runCli(["backup", "prune", directory, "--keep", "1", "--dry-run"]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Would remove harly-2026-01-01\.tar\.gz/);
  assert.equal((await remaining(directory)).length, 3);

  const real = runCli(["backup", "prune", directory, "--keep", "1", "--json"]);
  assert.equal(real.status, 0, real.stderr);
  const result = JSON.parse(real.stdout);
  assert.deepEqual(result.removed.sort(), ["harly-2026-01-01.tar.gz", "harly-2026-01-02.tar.gz"]);
  assert.deepEqual(await remaining(directory), ["harly-2026-01-03.tar.gz"]);
});

test("harly backup prune validates --keep", async () => {
  const directory = await installation(["harly-2026-01-01.tar.gz"]);
  for (const args of [[], ["--keep", "0"], ["--keep", "two"]]) {
    const result = runCli(["backup", "prune", directory, ...args]);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.match(`${result.stdout}${result.stderr}`, /--keep/);
  }
  assert.equal((await remaining(directory)).length, 1);
});
