import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// updater.ts is bundled into dist/index.js and not exported separately, so
// compile just that module to a temp file to exercise it directly.
const packageRoot = path.resolve(import.meta.dirname, "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "harly-updater-test-"));
const bundle = path.join(temp, "updater.mjs");
const build = spawnSync(
  "npx",
  [
    "esbuild",
    path.join(packageRoot, "src", "updater.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node20",
    `--outfile=${bundle}`,
  ],
  { cwd: packageRoot, encoding: "utf8" },
);
assert.equal(build.status, 0, build.stderr);
const { deriveUpdaterToken, parseClaim, parseEnvFile, performUpdate, renderSystemdUnit } =
  await import(bundle);
test.after(() => rm(temp, { recursive: true, force: true }));

const digest = `sha256:${"a".repeat(64)}`;
const stable = { version: "0.2.5", image: "ghcr.io/vytral/harly", digest };
const request = {
  id: "0b6f6c9e-1c5a-4d63-9a43-6f4f2d0c1111",
  targetVersion: "0.2.5",
  trigger: "manual",
};

test("derives the same token as the web app", () => {
  // Pinned to apps/web/src/features/updates/updater-token.test.ts.
  assert.equal(
    deriveUpdaterToken("cron-secret"),
    "76e21df626b2cb100ef4f62d87b6c746d17926c1bee2036fdf285db3e7e69979",
  );
});

test("parseClaim accepts only a well-formed request", () => {
  assert.deepEqual(parseClaim({ request }), request);
  assert.equal(parseClaim({ request: null }), null);
  assert.equal(parseClaim({}), null);
  assert.equal(parseClaim({ request: { ...request, targetVersion: "latest" } }), null);
  assert.equal(parseClaim({ request: { ...request, targetVersion: "0.2.5; rm -rf /" } }), null);
  assert.equal(parseClaim({ request: { ...request, id: "../etc" } }), null);
});

test("parseEnvFile reads plain and JSON-quoted values", () => {
  const env = parseEnvFile('CRON_SECRET="abc"\nHARLY_PORT=3100\n# comment\n');
  assert.equal(env.get("CRON_SECRET"), "abc");
  assert.equal(env.get("HARLY_PORT"), "3100");
});

test("renders a systemd unit that waits for a long update", () => {
  const unit = renderSystemdUnit({
    directory: "/opt/my harly",
    node: "/usr/bin/node",
    entry: "/usr/lib/node_modules/@harly/cli/dist/index.js",
    user: "deploy",
  });
  assert.match(unit, /^User=deploy$/m);
  assert.match(unit, /^ExecStart=\/usr\/bin\/node \/usr\/lib\/node_modules\/@harly\/cli\/dist\/index\.js updater run "\/opt\/my harly"$/m);
  assert.match(unit, /^TimeoutStopSec=1800$/m);
});

async function fixture() {
  const directory = await mkdtemp(path.join(temp, "install-"));
  await mkdir(path.join(directory, "backups"));
  await writeFile(path.join(directory, ".env"), 'HARLY_IMAGE="ghcr.io/vytral/harly@sha256:old"\n');
  await writeFile(path.join(directory, "harly.config.json"), '{"image":"old"}\n');
  const reports = [];
  const calls = { restore: [] };
  const deps = (overrides = {}) => ({
    directory,
    report: async (status, message, logTail) => {
      reports.push({ status, message, logTail });
    },
    fetchStableRelease: async () => stable,
    runUpdate: async () => ({ code: 0, output: "ok" }),
    runRestore: async (archive) => {
      calls.restore.push(archive);
      return { code: 0, output: "restored" };
    },
    now: () => Date.now(),
    ...overrides,
  });
  return { directory, reports, calls, deps };
}

const last = (reports) => reports.at(-1);

test("a successful update is reported as succeeded and leaves no journal", async () => {
  const { directory, reports, deps } = await fixture();
  const outcome = await performUpdate(request, deps());
  assert.equal(outcome.status, "succeeded");
  assert.equal(last(reports).status, "succeeded");
  await assert.rejects(readFile(path.join(directory, ".harly-updater.json")));
});

test("installs exactly the verified release digest, not whatever the channel serves later", async () => {
  const { deps } = await fixture();
  let installed = null;
  await performUpdate(request, deps({ runUpdate: async (image) => ((installed = image), { code: 0, output: "" }) }));
  assert.equal(installed, `${stable.image}@${stable.digest}`);
});

test("refuses a version the stable channel does not name, without touching anything", async () => {
  const { directory, reports, deps } = await fixture();
  let ran = false;
  const outcome = await performUpdate(
    { ...request, targetVersion: "0.9.9" },
    deps({ runUpdate: async () => ((ran = true), { code: 0, output: "" }) }),
  );
  assert.equal(outcome.status, "failed");
  assert.equal(ran, false);
  assert.match(last(reports).message, /channel now serves 0\.2\.5/);
  assert.equal(await readFile(path.join(directory, ".env"), "utf8"), 'HARLY_IMAGE="ghcr.io/vytral/harly@sha256:old"\n');
});

test("refuses when the release channel cannot be read", async () => {
  const { deps } = await fixture();
  const outcome = await performUpdate(request, deps({ fetchStableRelease: async () => null }));
  assert.equal(outcome.status, "failed");
  assert.match(outcome.message, /nothing was changed/);
});

test("a failure before the install changed does not roll back", async () => {
  const { calls, deps } = await fixture();
  const outcome = await performUpdate(
    request,
    deps({ runUpdate: async () => ({ code: 1, output: "pull failed" }) }),
  );
  assert.equal(outcome.status, "failed");
  assert.match(outcome.message, /before changing anything/);
  assert.deepEqual(calls.restore, []);
});

test("a failure after the install changed restores the pins and the backup", async () => {
  const { directory, reports, calls, deps } = await fixture();
  const oldEnv = await readFile(path.join(directory, ".env"), "utf8");
  const oldConfig = await readFile(path.join(directory, "harly.config.json"), "utf8");
  const archive = path.join(directory, "backups", "harly-2026-03-02T02-00-00-000Z.tar.gz");
  const outcome = await performUpdate(
    request,
    deps({
      runUpdate: async () => {
        // What `harly update` does before the health check fails.
        await writeFile(archive, "archive");
        await writeFile(path.join(directory, ".env"), 'HARLY_IMAGE="ghcr.io/vytral/harly@sha256:new"\n');
        await writeFile(path.join(directory, "harly.config.json"), '{"image":"new"}\n');
        return { code: 1, output: "health checks failed" };
      },
    }),
  );
  assert.equal(outcome.status, "rolled_back");
  assert.equal(last(reports).status, "rolled_back");
  assert.deepEqual(calls.restore, [archive]);
  assert.equal(await readFile(path.join(directory, ".env"), "utf8"), oldEnv);
  assert.equal(await readFile(path.join(directory, "harly.config.json"), "utf8"), oldConfig);
  assert.match(last(reports).logTail, /health checks failed/);
});

test("ignores backups older than this update when choosing the rollback point", async () => {
  const { directory, calls, deps } = await fixture();
  const stale = path.join(directory, "backups", "harly-2020-01-01T00-00-00-000Z.tar.gz");
  await writeFile(stale, "old");
  await utimes(stale, new Date("2020-01-01"), new Date("2020-01-01"));
  const outcome = await performUpdate(
    request,
    deps({
      runUpdate: async () => {
        await writeFile(path.join(directory, ".env"), "HARLY_IMAGE=changed\n");
        return { code: 1, output: "boom" };
      },
    }),
  );
  assert.equal(outcome.status, "failed");
  assert.match(outcome.message, /no pre-update backup/);
  assert.deepEqual(calls.restore, []);
});

test("reports a failed rollback with the archive to restore by hand", async () => {
  const { directory, deps } = await fixture();
  const outcome = await performUpdate(
    request,
    deps({
      runUpdate: async () => {
        await writeFile(path.join(directory, "backups", "harly-now.tar.gz"), "archive");
        await writeFile(path.join(directory, ".env"), "HARLY_IMAGE=changed\n");
        return { code: 1, output: "boom" };
      },
      runRestore: async () => ({ code: 1, output: "pg_restore failed" }),
    }),
  );
  assert.equal(outcome.status, "failed");
  assert.match(outcome.message, /rollback did not complete/);
  assert.match(outcome.message, /harly-now\.tar\.gz/);
});
