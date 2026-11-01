import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(packageRoot, "dist", "index.js");
const temp = await mkdtemp(path.join(os.tmpdir(), "harly-ux-"));
test.after(() => rm(temp, { recursive: true, force: true }));

/** Bundles one source file so tests can import its pure functions. */
async function load(name) {
  const outfile = path.join(temp, `${name}.mjs`);
  const build = spawnSync("npx", ["esbuild", path.join(packageRoot, "src", `${name}.ts`), "--bundle", "--platform=node", "--format=esm", "--target=node20", `--outfile=${outfile}`], { cwd: packageRoot, encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  return import(outfile);
}

const { suggest, editDistance, didYouMean, commandAliases } = await load("suggest");
const { groupEntries, renderHelp, renderCommandHelp, unknownCommandMessage, knownCommands, commandNameOf, shortUsage } = await load("help");
const { configDir, updatePrefs, readPrefs } = await load("prefs");
const { parseComposePs, describeService, formatAge, latestBackup } = await load("status");
const { errorHints } = await load("hints");
const { newerCliVersion, updateCheckEnabled, latestCliVersion } = await load("cli-update-check");

const entries = [
  ["harly", "Guided menu"],
  ["harly check [directory]", "Verify host"],
  ["harly init [directory] [--force] [--dry-run]", "Generate"],
  ["harly status [directory] [--json]", "Status"],
  ["harly doctor [directory] [--json] [--fix]", "Doctor"],
  ["harly backup [directory] [--encrypt]", "Backup"],
  ["harly update [directory] [--to version]", "Update"],
  ["harly mystery-new-command", "Registered later by another feature"],
  ["harly install-global [--yes]", "Install globally"],
];

function run(args, env = {}, cwd = packageRoot) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd, encoding: "utf8",
    env: { ...process.env, CI: "", HARLY_CONFIG_DIR: path.join(temp, "cfg"), HARLY_NO_UPDATE_CHECK: "1", ...env },
  });
}
const ansi = /\u001b\[/;

test("typos resolve to the closest command, aliases and prefixes included", () => {
  const names = knownCommands(entries);
  assert.equal(suggest("docter", names)[0], "doctor");
  assert.equal(suggest("dcotor", names)[0], "doctor");
  assert.equal(suggest("statsu", names)[0], "status");
  assert.equal(suggest("back", names)[0], "backup");
  assert.equal(suggest("install", names, { aliases: commandAliases })[0], "init");
  assert.deepEqual(suggest("zzzzzz", names), []);
  assert.deepEqual(suggest("", names), []);
  assert.equal(editDistance("abc", "abd"), 1);
  assert.equal(editDistance("ab", "ba"), 1);
});

test("flag typos are suggested and phrased as a question", () => {
  assert.deepEqual(suggest("--forse", ["--force", "--json", "--yes"]), ["--force"]);
  assert.equal(didYouMean(["--force"]), "Did you mean --force?");
  assert.equal(didYouMean(["a", "b", "c"]), "Did you mean a, b or c?");
  assert.equal(didYouMean([]), "");
});

test("help groups commands by purpose and keeps unregistered ones visible", () => {
  const groups = groupEntries(entries);
  const titles = groups.map((group) => group.title);
  assert.deepEqual(titles, ["Get started", "Day to day", "Keep it current", "Cloud and tooling", "More"]);
  assert.deepEqual(groups[1].entries.map((entry) => commandNameOf(entry[0])), ["status", "doctor", "backup"]);
  assert.deepEqual(groups.at(-1).entries.map((entry) => commandNameOf(entry[0])), ["mystery-new-command"]);
  const text = renderHelp(entries, { version: "9.9.9" });
  for (const heading of ["Get started", "Day to day", "Options for every command", "Examples"]) assert.match(text, new RegExp(heading));
  assert.match(text, /v9\.9\.9/);
  assert.doesNotMatch(text, /--dry-run\]/, "the overview omits flag tails; per-command help carries them");
  assert.equal(shortUsage("harly init [directory] [--force] [--dry-run]"), "harly init [directory]");
});

test("per-command help lists options and examples, and unknown commands get suggestions", () => {
  const text = renderCommandHelp(entries, "backup");
  assert.match(text, /--encrypt/);
  assert.match(text, /harly backup/);
  assert.equal(renderCommandHelp(entries, "nope"), null);
  assert.match(renderCommandHelp(entries, "upgrade") ?? "", /harly update/);
  assert.match(unknownCommandMessage("docter", entries), /Unknown command: docter\. Did you mean harly doctor\?/);
  assert.match(unknownCommandMessage("qqqqqq", entries), /Unknown command: qqqqqq\. Run harly help/);
});

test("config directory follows XDG on Linux and macOS, APPDATA on Windows", () => {
  assert.equal(configDir({}, "linux", "/home/me"), "/home/me/.config/harly");
  assert.equal(configDir({}, "darwin", "/Users/me"), "/Users/me/.config/harly");
  assert.equal(configDir({ XDG_CONFIG_HOME: "/x/cfg" }, "linux", "/home/me"), "/x/cfg/harly");
  assert.equal(configDir({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, "win32", "C:\\Users\\me"), "C:\\Users\\me\\AppData\\Roaming\\harly");
  assert.equal(configDir({ HARLY_CONFIG_DIR: "/override" }, "linux", "/home/me"), "/override");
});

test("preferences round-trip, tolerate corruption, and never throw", async () => {
  const env = { HARLY_CONFIG_DIR: path.join(temp, "prefs") };
  assert.deepEqual(await readPrefs(env), {});
  assert.equal(await updatePrefs((p) => ({ ...p, globalInstall: { declined: true } }), env), true);
  assert.equal((await readPrefs(env)).globalInstall.declined, true);
  await writeFile(path.join(temp, "prefs", "config.json"), "{not json");
  assert.deepEqual(await readPrefs(env), {});
  // A path that cannot be created reports false instead of throwing.
  await writeFile(path.join(temp, "blocker"), "file");
  assert.equal(await updatePrefs((p) => p, { HARLY_CONFIG_DIR: path.join(temp, "blocker", "sub") }), false);
});

test("compose ps output parses from NDJSON and arrays and maps to a verdict", () => {
  const nd = [
    JSON.stringify({ Service: "postgres", State: "running", Health: "healthy" }),
    JSON.stringify({ Service: "app", State: "running", Health: "starting" }),
    JSON.stringify({ Service: "caddy", State: "exited", Health: "" }),
  ].join("\n");
  const services = parseComposePs(nd);
  assert.equal(services.length, 3);
  assert.deepEqual(describeService(services[0]), { ok: true, detail: "running · healthy" });
  assert.equal(describeService(services[1]).ok, false);
  assert.equal(describeService(services[2]).ok, false);
  assert.equal(describeService(undefined).ok, false);
  assert.equal(parseComposePs(JSON.stringify([{ Service: "app", State: "running" }]))[0].healthy, null);
  assert.deepEqual(parseComposePs(""), []);
  assert.deepEqual(parseComposePs("warning: not json"), []);
});

test("backup age and latest archive are read from the backups folder", async () => {
  const dir = path.join(temp, "install");
  await mkdir(path.join(dir, "backups"), { recursive: true });
  assert.equal(await latestBackup(path.join(temp, "nowhere")), null);
  await writeFile(path.join(dir, "backups", "harly-old.tar.gz"), "a");
  await writeFile(path.join(dir, "backups", "harly-new.tar.gz.age"), "bb");
  await writeFile(path.join(dir, "backups", "notes.txt"), "x");
  await utimes(path.join(dir, "backups", "harly-old.tar.gz"), new Date(2020, 0, 1), new Date(2020, 0, 1));
  const latest = await latestBackup(dir);
  assert.match(latest.file, /harly-new\.tar\.gz\.age$/);
  assert.equal(latest.encrypted, true);
  assert.equal(formatAge(10_000), "just now");
  assert.equal(formatAge(5 * 60_000), "5 min ago");
  assert.equal(formatAge(3 * 3600_000), "3 hours ago");
  assert.equal(formatAge(5 * 86_400_000), "5 days ago");
});

test("errors carry next steps, and remedies stay out of unrelated failures", () => {
  assert.match(errorHints("No Harly installation found here.", "status").join("\n"), /harly status \/path\/to\/harly/);
  assert.match(errorHints("Cannot connect to the Docker daemon at unix:///var/run/docker.sock", "launch").join("\n"), /Docker is not running/);
  assert.match(errorHints("--yes is required in non-interactive mode.", "launch").join("\n"), /--yes/);
  assert.deepEqual(errorHints("something entirely unrelated", "backup"), []);
  assert.ok(errorHints("timed out waiting", "launch").length <= 3);
});

test("CLI update notices are cached, opt-out, and interactive-only", async () => {
  assert.equal(newerCliVersion("0.5.2", "0.6.0"), "0.6.0");
  assert.equal(newerCliVersion("0.6.0", "0.6.0"), null);
  assert.equal(newerCliVersion("0.6.0", "0.7.0-beta.1"), null);
  assert.equal(newerCliVersion("0.6.0", undefined), null);
  assert.equal(updateCheckEnabled({}, true), true);
  assert.equal(updateCheckEnabled({}, false), false);
  assert.equal(updateCheckEnabled({ CI: "true" }, true), false);
  assert.equal(updateCheckEnabled({ HARLY_NO_UPDATE_CHECK: "1" }, true), false);
  const env = { HARLY_CONFIG_DIR: path.join(temp, "update-check") };
  let fetched = 0;
  const fetchLatest = async () => { fetched += 1; return "0.7.0"; };
  assert.equal(await latestCliVersion(env, { refresh: true, fetchLatest }), "0.7.0");
  assert.equal(await latestCliVersion(env, { refresh: true, fetchLatest }), "0.7.0");
  assert.equal(fetched, 1, "a fresh cache is not refetched");
  assert.equal(await latestCliVersion({ HARLY_CONFIG_DIR: path.join(temp, "empty") }, { refresh: false, fetchLatest }), undefined);
  assert.equal(await latestCliVersion({ HARLY_CONFIG_DIR: path.join(temp, "offline") }, { refresh: true, fetchLatest: async () => { throw new Error("offline"); } }), undefined);
});

// --- Behaviour of the built CLI without a terminal (stdin and stdout are pipes) ---

test("no arguments without a terminal prints grouped help and never prompts", () => {
  const result = run([], {}, temp);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Get started/);
  assert.match(result.stdout, /Day to day/);
  assert.match(result.stdout, /harly status/);
  assert.doesNotMatch(result.stdout, ansi, "pipes get plain text");
});

test("--no-color and NO_COLOR strip colour even on a colour-capable stream", () => {
  const forced = run(["--help", "--no-color"], { FORCE_COLOR: "1" });
  assert.doesNotMatch(forced.stdout, ansi);
  const env = run(["--help"], { FORCE_COLOR: "1", NO_COLOR: "1" });
  assert.doesNotMatch(env.stdout, ansi);
});

test("help <command> and <command> --help explain one command", () => {
  for (const args of [["help", "backup"], ["backup", "--help"]]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--encrypt/);
    assert.doesNotMatch(result.stdout, /Get started/);
  }
  const json = JSON.parse(run(["--json", "help", "backup"]).stdout);
  assert.equal(json.command, "backup");
});

test("--json help keeps the flat command list and adds groups", () => {
  const document = JSON.parse(run(["--json", "--help"]).stdout);
  assert.ok(document.commands.some((command) => command.name.startsWith("harly doctor")));
  assert.ok(document.groups.some((group) => group.title === "Day to day"));
});

test("an unknown command exits 2 with a suggestion, as JSON when asked", () => {
  const human = run(["docter"]);
  assert.equal(human.status, 2);
  assert.match(human.stderr, /Did you mean harly doctor\?/);
  assert.equal(human.stdout, "", "no usage dump on stdout");
  const json = run(["--json", "docter"]);
  assert.equal(json.status, 2);
  const document = JSON.parse(json.stdout);
  assert.equal(document.error.code, "INVALID_ARGUMENT");
  assert.match(document.error.message, /harly doctor/);
});

test("an unknown option suggests the closest flag", () => {
  const result = run(["doctor", "--forse"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Did you mean --force\?/);
});

test("status outside an installation fails with next steps and structured JSON", async () => {
  const empty = path.join(temp, "no-install");
  await mkdir(empty, { recursive: true });
  const plain = run(["status", empty]);
  assert.equal(plain.status, 2);
  assert.match(plain.stderr, /No Harly installation found/);
  assert.match(plain.stderr, /Next:/);
  const quiet = run(["status", empty, "--quiet"]);
  assert.doesNotMatch(quiet.stderr, /Next:/);
  const json = run(["status", empty, "--json"]);
  assert.equal(json.stdout.trim().split("\n").length, 1);
  assert.equal(JSON.parse(json.stdout).ok, false);
});

test("status reads a saved installation without a terminal and reports what it can verify", async () => {
  const dir = path.join(temp, "saved");
  await mkdir(path.join(dir, "backups"), { recursive: true });
  await writeFile(path.join(dir, "backups", "harly-1.tar.gz"), "data");
  await writeFile(path.join(dir, "harly.config.json"), JSON.stringify({
    version: 1, proxyMode: "local", publicUrl: "http://127.0.0.1:9", image: "ghcr.io/vytral/harly:0.2.4",
    organizationName: "x", initialAdminEmail: "a@b.c", storage: "local", resourceProfile: "standard",
  }));
  const result = run(["status", dir, "--json"], { HARLY_RELEASE_MANIFEST_URL: "http://127.0.0.1:1/off" });
  const document = JSON.parse(result.stdout);
  assert.equal(document.command, "status");
  assert.equal(document.version.current, "v0.2.4");
  assert.equal(document.readiness.ok, false);
  assert.equal(document.backup.encrypted, false);
  assert.equal(document.certificate, null, "plain http has no certificate to read");
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /SECRET|PASSWORD/i);
  const text = run(["status", dir], { HARLY_RELEASE_MANIFEST_URL: "http://127.0.0.1:1/off" });
  assert.match(text.stdout, /INSTANCE/);
  assert.match(text.stdout, /Last backup/);
  assert.match(text.stdout, /Harly needs attention/);
  assert.doesNotMatch(text.stdout, ansi);
});

test("install-global never installs without consent when there is no terminal", () => {
  const refused = run(["install-global"]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /--yes/);
  const dry = run(["install-global", "--dry-run", "--json"]);
  assert.equal(dry.status, 0, dry.stderr);
  const document = JSON.parse(dry.stdout);
  assert.equal(document.status, "dry-run");
  assert.equal(document.sideEffects, false);
  assert.match(document.npmCommand, /^npm install --global @harly\/cli@/);
});

test("an npx run without a terminal never writes the remembered-answer file", async () => {
  const configHome = path.join(temp, "npx-cfg");
  const result = run(["--help"], { HARLY_CONFIG_DIR: configHome, npm_command: "exec", npm_execpath: "/x/npm-cli.js" });
  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(readFile(path.join(configHome, "config.json")), { code: "ENOENT" });
});
