import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "harly-telemetry-test-"));
const bundle = path.join(temp, "telemetry.mjs");
const build = spawnSync("npx", ["esbuild", path.join(packageRoot, "src/telemetry.ts"), "--bundle", "--platform=node", "--format=esm", "--target=node20", `--outfile=${bundle}`], { cwd: packageRoot, encoding: "utf8" });
assert.equal(build.status, 0, build.stderr);
const { resolveConsent, buildPayload, reportInstall, sendTelemetry, setTelemetryConsent, telemetryStatus } = await import(bundle);
test.after(() => rm(temp, { recursive: true, force: true }));

test("telemetry requires consent; any explicit opt-out wins", () => {
  const base = { prefs: {}, env: {}, interactive: false };
  assert.equal(resolveConsent(base), "off");
  assert.equal(resolveConsent({ ...base, interactive: true }), "ask");
  assert.equal(resolveConsent({ ...base, telemetryFlag: true }), "send");
  assert.equal(resolveConsent({ ...base, prefs: { telemetry: { enabled: false } }, interactive: true }), "off");
  for (const override of [{ noTelemetryFlag: true }, { env: { HARLY_TELEMETRY: "0" } }, { env: { DO_NOT_TRACK: "1" } }]) {
    assert.equal(resolveConsent({ ...base, prefs: { telemetry: { enabled: true } }, telemetryFlag: true, ...override }), "off");
  }
});

test("payload includes only disclosed fields and omits referral when skipped", () => {
  const payload = buildPayload({ instanceId: "random-id", cliVersion: "0.7.0", platform: "linux", arch: "x64", deployMode: "caddy", referral: "skip", domain: "private.example", email: "private@example.com", secret: "private" });
  assert.deepEqual(payload, { schema: 1, event: "install_completed", instanceId: "random-id", cliVersion: "0.7.0", os: "linux", arch: "x64", deployMode: "caddy" });
});

test("disabled installs never make a request", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected request"); });
  assert.equal(await reportInstall({ prefs: {}, env: {}, cliVersion: "0.7.0" }), false);
  assert.equal(await reportInstall({ prefs: { telemetry: { enabled: true } }, env: { DO_NOT_TRACK: "1" }, cliVersion: "0.7.0" }), false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("delivery errors never fail an installation and redirects are refused", async () => {
  const payload = buildPayload({ instanceId: "random-id", cliVersion: "0.7.0" });
  assert.equal(await sendTelemetry(payload, { env: {}, fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    throw new Error("offline");
  } }), false);
  assert.equal(await sendTelemetry(payload, { env: {}, fetchImpl: async () => new Response("", { status: 503 }) }), false);
});

test("consent persists locally and disabling keeps it off", async () => {
  const env = { HARLY_CONFIG_DIR: path.join(temp, "prefs") };
  const enabled = await setTelemetryConsent(true, env, "github");
  assert.equal(enabled.saved, true);
  assert.match(enabled.instanceId, /^[0-9a-f-]{36}$/);
  assert.equal((await telemetryStatus({ env })).enabled, true);
  await setTelemetryConsent(false, env);
  assert.equal((await telemetryStatus({ env })).enabled, false);
});
