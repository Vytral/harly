import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "harly-global-cli-test-"));
const bundle = path.join(temp, "global-cli.mjs");
const build = spawnSync("npx", ["esbuild", path.join(packageRoot, "src/global-cli.ts"), "--bundle", "--platform=node", "--format=esm", "--target=node20", `--outfile=${bundle}`], { cwd: packageRoot, encoding: "utf8" });
assert.equal(build.status, 0, build.stderr);
const { isNpxInvocation, offerGlobalCliInstallation } = await import(bundle);
test.after(() => rm(temp, { recursive: true, force: true }));

async function fixture(t, { answer = true, installedVersion, failure = false, onPath = true } = {}) {
  const directory = await realpath(await mkdtemp(path.join(temp, "fixture-")));
  const bin = path.join(directory, "bin");
  const prefix = path.join(directory, "global");
  const calls = path.join(directory, "npm.calls");
  await mkdir(bin);
  await writeFile(path.join(bin, "npm"), `#!/bin/sh
printf '%s\\n' "$*" >> "$HARLY_TEST_NPM_CALLS"
case "$1" in
  ls) printf '%s\\n' "$HARLY_TEST_NPM_LIST" ;;
  prefix) printf '%s\\n' "$HARLY_TEST_NPM_PREFIX" ;;
  install)
    if [ "$HARLY_TEST_NPM_FAILURE" = "1" ]; then
      echo 'npm error EACCES permission denied' >&2
      exit 1
    fi
    ;;
esac
exit 0
`);
  await chmod(path.join(bin, "npm"), 0o755);
  const events = [];
  const ui = {
    confirm: async (message) => { events.push(["confirm", message]); return answer; },
    start: (message) => events.push(["start", message]),
    stop: (message) => events.push(["stop", message]),
    info: (message) => events.push(["info", message]),
    warn: (message) => events.push(["warn", message]),
  };
  const options = {
    interactive: true, version: "0.5.2", directory, ui,
    entrypoint: "/tmp/_npx/hash/node_modules/@harly/cli/bin/harly.mjs",
    env: {
      ...process.env, npm_execpath: "", npm_command: "exec",
      PATH: [bin, ...(onPath ? [path.join(prefix, "bin")] : []), process.env.PATH].join(path.delimiter),
      HARLY_TEST_NPM_CALLS: calls, HARLY_TEST_NPM_PREFIX: prefix,
      HARLY_TEST_NPM_LIST: JSON.stringify({ dependencies: installedVersion ? { "@harly/cli": { version: installedVersion } } : {} }),
      HARLY_TEST_NPM_FAILURE: failure ? "1" : "0",
    },
  };
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { options, events, calls, prefix, directory, run: (extra = {}) => offerGlobalCliInstallation({ ...options, ...extra }) };
}

test("npx detection accepts cached entrypoints and npm exec, but excludes global and pnpm runs", () => {
  assert.equal(isNpxInvocation({}, "/tmp/_npx/hash/bin/harly"), true);
  assert.equal(isNpxInvocation({ npm_command: "exec", npm_execpath: "/usr/lib/npm/bin/npm-cli.js" }, "/tmp/harly"), true);
  assert.equal(isNpxInvocation({ npm_command: "exec", npm_execpath: "/tmp/pnpm.cjs" }, "/tmp/harly"), false);
  assert.equal(isNpxInvocation({}, "/usr/lib/node_modules/@harly/cli/bin/harly.mjs"), false);
});

test("non-interactive npx runs never inspect or install global packages", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.run({ interactive: false }), "skipped");
  assert.deepEqual(f.events, []);
  await assert.rejects(stat(f.calls), { code: "ENOENT" });
});

test("global CLI runs do not offer to reinstall themselves", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.run({ entrypoint: "/usr/bin/harly" }), "skipped");
  assert.deepEqual(f.events, []);
  await assert.rejects(stat(f.calls), { code: "ENOENT" });
});

test("an existing global CLI skips the prompt and is not upgraded automatically", async (t) => {
  const f = await fixture(t, { installedVersion: "0.5.1" });
  assert.equal(await f.run(), "already-installed");
  assert.ok(f.events.every(([kind]) => kind !== "confirm"));
  assert.doesNotMatch(await readFile(f.calls, "utf8"), /^install /m);
});

test("declining and cancelling leave npx available without installing anything", async (t) => {
  for (const answer of [false, Symbol("cancel")]) {
    const f = await fixture(t, { answer });
    f.options.env.npm_config_yes = "true";
    assert.equal(await f.run(), "skipped");
    assert.doesNotMatch(await readFile(f.calls, "utf8"), /^install /m);
    assert.ok(f.events.some(([kind, message]) => kind === "info" && message.includes("npx @harly/cli")));
  }
});

test("accepting installs the running CLI version and explains application versus CLI updates", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.run(), "installed");
  assert.match(await readFile(f.calls, "utf8"), /^install --global @harly\/cli@0\.5\.2 --no-audit --no-fund$/m);
  assert.ok(f.events.some(([kind, message]) => kind === "info" && message.includes("harly doctor")));
  assert.ok(f.events.some(([kind, message]) => kind === "info" && message.includes("npm install -g @harly/cli@latest")));
});

test("npm permissions failures are nonfatal and give a manual retry command", async (t) => {
  const f = await fixture(t, { failure: true });
  assert.equal(await f.run(), "failed");
  assert.ok(f.events.some(([kind, message]) => kind === "warn" && /Harly is still running.*global installation directory/.test(message)));
  assert.ok(f.events.some(([kind, message]) => kind === "warn" && message.includes("npm install -g @harly/cli@0.5.2")));
});

test("successful installation warns when the global bin directory is outside PATH", async (t) => {
  const f = await fixture(t, { onPath: false });
  assert.equal(await f.run(), "installed");
  assert.ok(f.events.some(([kind, message]) => kind === "warn" && message.includes(path.join(f.prefix, "bin")) && message.includes("PATH")));
  assert.ok(!f.events.some(([kind, message]) => kind === "info" && message.includes("Use harly doctor")));
});

test("installation uses the npm CLI that launched npx when its path is available", async (t) => {
  const f = await fixture(t);
  const npmPath = path.join(f.directory, "npm-cli.js");
  await writeFile(npmPath, `const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.HARLY_TEST_NPM_CALLS, 'node-npm:' + args.join(' ') + '\\n');
if (args[0] === 'ls') console.log('{}');
if (args[0] === 'prefix') console.log(process.env.HARLY_TEST_NPM_PREFIX);
`);
  assert.equal(await f.run({ env: { ...f.options.env, npm_execpath: npmPath } }), "installed");
  const calls = await readFile(f.calls, "utf8");
  assert.ok(calls.trim().split("\n").every((line) => line.startsWith("node-npm:")));
});
