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
const { isNpxInvocation, offerGlobalCliInstallation, installGlobalCli, shouldOfferGlobalInstall, classifyInstalled, planExplicitInstall, pathHint } = await import(bundle);
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
      // Remembered answers must never touch the developer's real config.
      HARLY_CONFIG_DIR: path.join(directory, "config"),
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

test("the offer defaults to yes and uses the plain-language question", async (t) => {
  const f = await fixture(t);
  let seen;
  f.options.ui.confirm = async (message, initialValue) => { seen = { message, initialValue }; return false; };
  await f.run();
  assert.match(seen.message, /Install Harly globally so you can just type `harly`\?/);
  assert.equal(seen.initialValue, true);
});

test("a declined offer is remembered and never asked again", async (t) => {
  const f = await fixture(t, { answer: false });
  assert.equal(await f.run(), "skipped");
  const saved = JSON.parse(await readFile(path.join(f.directory, "config", "config.json"), "utf8"));
  assert.equal(saved.globalInstall.declined, true);
  f.events.length = 0;
  const callsBefore = await readFile(f.calls, "utf8");
  assert.equal(await f.run(), "skipped");
  assert.deepEqual(f.events, []);
  assert.equal(await readFile(f.calls, "utf8"), callsBefore);
  assert.ok(f.events.every(([kind]) => kind !== "confirm"));
});

test("a failed or accepted install does not record a decline", async (t) => {
  const f = await fixture(t, { failure: true });
  assert.equal(await f.run(), "failed");
  await assert.rejects(stat(path.join(f.directory, "config", "config.json")), { code: "ENOENT" });
});

test("the offer decision is pure: it asks only interactive, npx, not-yet-declined runs", () => {
  assert.deepEqual(shouldOfferGlobalInstall({ interactive: true, npx: true, declined: false }), { offer: true });
  assert.deepEqual(shouldOfferGlobalInstall({ interactive: false, npx: true, declined: false }), { offer: false, reason: "non-interactive" });
  assert.deepEqual(shouldOfferGlobalInstall({ interactive: true, npx: false, declined: false }), { offer: false, reason: "not-npx" });
  assert.deepEqual(shouldOfferGlobalInstall({ interactive: true, npx: true, declined: true }), { offer: false, reason: "declined" });
});

test("installed versions are classified against the running CLI", () => {
  assert.equal(classifyInstalled(undefined, "0.6.0"), "none");
  assert.equal(classifyInstalled("0.6.0", "0.6.0"), "same");
  assert.equal(classifyInstalled("0.5.9", "0.6.0"), "older");
  assert.equal(classifyInstalled("0.10.0", "0.9.0"), "newer");
});

test("explicit install-global plans: yes installs, non-interactive without yes refuses, dry-run is inert", () => {
  const base = { installed: undefined, current: "0.6.0", interactive: false, yes: false, dryRun: false };
  assert.equal(planExplicitInstall({ ...base }), "needs-confirmation");
  assert.equal(planExplicitInstall({ ...base, yes: true }), "install");
  assert.equal(planExplicitInstall({ ...base, interactive: true }), "confirm");
  assert.equal(planExplicitInstall({ ...base, dryRun: true, yes: true }), "dry-run");
  assert.equal(planExplicitInstall({ ...base, installed: "0.6.0", yes: true }), "already-installed");
  assert.equal(planExplicitInstall({ ...base, installed: "0.5.0", yes: true }), "install");
});

test("PATH hints give the exact command for each shell", () => {
  const bin = "/home/me/.npm-global/bin";
  const zsh = pathHint({ binDir: bin, platform: "darwin", shell: "/bin/zsh" });
  assert.equal(zsh.shell, "zsh");
  assert.equal(zsh.command, `echo 'export PATH="$PATH:${bin}"' >> ~/.zshrc`);
  assert.match(zsh.reload, /source ~\/\.zshrc/);
  assert.match(pathHint({ binDir: bin, platform: "linux", shell: "/usr/bin/bash" }).command, /~\/\.bashrc$/);
  assert.match(pathHint({ binDir: bin, platform: "darwin", shell: "/bin/bash" }).command, /~\/\.bash_profile$/);
  assert.equal(pathHint({ binDir: bin, platform: "linux", shell: "/usr/bin/fish" }).command, `fish_add_path '${bin}'`);
  assert.match(pathHint({ binDir: bin, platform: "linux", shell: undefined }).command, /~\/\.profile$/);
  const win = pathHint({ binDir: "C:\\Users\\me\\AppData\\Roaming\\npm", platform: "win32" });
  assert.equal(win.shell, "PowerShell");
  assert.match(win.command, /SetEnvironmentVariable\("Path".*AppData\\Roaming\\npm", "User"\)/);
});

test("the off-PATH warning includes the exact shell command", async (t) => {
  const f = await fixture(t, { onPath: false });
  f.options.env.SHELL = "/bin/zsh";
  await f.run();
  assert.ok(f.events.some(([kind, message]) => kind === "info" && message.includes("~/.zshrc") && message.includes(path.join(f.prefix, "bin"))));
});

test("explicit install-global installs with yes, previews with dry-run, and refuses without consent", async (t) => {
  const f = await fixture(t);
  const base = { interactive: false, yes: false, dryRun: false, version: "0.5.2", directory: f.directory, ui: f.options.ui, env: f.options.env };
  assert.equal((await installGlobalCli({ ...base, dryRun: true, yes: true })).status, "dry-run");
  assert.equal((await installGlobalCli({ ...base })).status, "needs-confirmation");
  assert.doesNotMatch(await readFile(f.calls, "utf8"), /^install /m);
  const done = await installGlobalCli({ ...base, yes: true });
  assert.equal(done.status, "installed");
  assert.match(await readFile(f.calls, "utf8"), /^install --global @harly\/cli@0\.5\.2 --no-audit --no-fund$/m);
});

test("explicit install-global ignores a remembered decline and reports an existing install", async (t) => {
  const f = await fixture(t, { answer: false });
  await f.run();
  const again = await installGlobalCli({ interactive: true, yes: true, dryRun: false, version: "0.5.2", directory: f.directory, ui: f.options.ui, env: f.options.env });
  assert.equal(again.status, "installed");
  const g = await fixture(t, { installedVersion: "0.5.2" });
  const result = await installGlobalCli({ interactive: false, yes: true, dryRun: false, version: "0.5.2", directory: g.directory, ui: g.options.ui, env: g.options.env });
  assert.equal(result.status, "already-installed");
  assert.doesNotMatch(await readFile(g.calls, "utf8"), /^install /m);
});
