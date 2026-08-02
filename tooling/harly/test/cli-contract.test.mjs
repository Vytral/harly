import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(packageRoot, "dist", "index.js");

function run(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("global flags work before and after init and JSON stdout is a single document", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "harly-cli-contract-"));
  const target = path.join(parent, "installation");
  try {
    const result = run([
      "--json",
      "init",
      target,
      "--dry-run",
      "--url",
      "http://127.0.0.1:3000",
      "--proxy",
      "local",
      "--email",
      "owner@example.com",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const document = JSON.parse(result.stdout);
    assert.equal(document.schemaVersion, 1);
    assert.equal(document.status, "dry-run");
    assert.equal(document.sideEffects, false);
    assert.equal(result.stdout.trim().split("\n").length, 1);
    assert.doesNotMatch(result.stdout, /no files were written/i);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("JSON failures are structured and never prompt", () => {
  const result = run(["init", "--json", "--non-interactive", "--url", "http://127.0.0.1:3000", "--proxy", "local"]);
  assert.equal(result.status, 2);
  const document = JSON.parse(result.stdout);
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.ok, false);
  assert.equal(document.error.code, "MISSING_ARGUMENT");
  assert.doesNotMatch(result.stdout, /password|secret/i);
});

test("conflicting output aliases and sensitive flags fail with stable errors", () => {
  const result = run([
    "--json",
    "init",
    "./one",
    "--output-dir",
    "./two",
    "--url",
    "http://127.0.0.1:3000",
    "--proxy",
    "local",
    "--email",
    "owner@example.com",
  ]);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).error.code, "INVALID_ARGUMENT");

  const secret = run(["--json", "deploy", "railway", "--railway-token", "top-secret"]);
  assert.equal(secret.status, 2);
  const document = JSON.parse(secret.stdout);
  assert.equal(document.error.code, "INVALID_ARGUMENT");
  assert.doesNotMatch(document.error.message, /top-secret/);
});

test("dry-run cloud prepare has no filesystem side effects", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "harly-cloud-contract-"));
  try {
    const result = run(
      ["--json", "deploy", "fly", "prepare", "--dry-run"],
      {
        HARLY_URL: "https://harly.example.com",
        HARLY_INITIAL_ADMIN_EMAIL: "owner@example.com",
        S3_BUCKET: "harly",
        S3_ACCESS_KEY_ID: "access",
        S3_SECRET_ACCESS_KEY: "secret",
        HARLY_RELEASE_MANIFEST_URL: "http://127.0.0.1:1/disabled",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const document = JSON.parse(result.stdout);
    assert.equal(document.status, "ready-to-deploy");
    assert.ok(document.artifacts.some((item) => item.endsWith("fly.toml")));
    assert.doesNotMatch(result.stdout, /top-secret|access-key-value/i);
    assert.deepEqual(document.note, "Secrets were not saved locally. Use --save-env to opt in.");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
