import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Every environment variable the product reads must be listed in
 * `.env.example` and described in `apps/docs/deployment/configuration.mdx`,
 * or be named in ALLOWLIST below with the reason it is not an operator setting.
 *
 * When this test fails after you add `process.env.NEW_NAME`:
 *   1. Add `NEW_NAME=` (with a safe placeholder) and a comment to `.env.example`.
 *   2. Describe it in `apps/docs/deployment/configuration.mdx`.
 *   3. If it forwards into containers, add it to `compose.yaml` as well.
 * Only add it to ALLOWLIST when it is set by the platform, the image or a
 * test, and no operator should configure it.
 */
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** name -> why an operator never sets it in `.env`. */
const ALLOWLIST = new Map([
  // Set by the OS, shell, package manager or hosting platform.
  ...[
    "APPDATA", "CI", "COLORTERM", "DO_NOT_TRACK", "NEXT_PHASE", "NEXT_RUNTIME",
    "NO_UPDATE_NOTIFIER", "PATH", "PORT", "SHELL", "SUDO_USER", "TERM",
    "XDG_CONFIG_HOME",
  ].map((name) => [name, "platform or tool variable"]),
  // Read by the CLI on the operator's machine. Documented in
  // apps/docs/deployment/cli.mdx, not in the application's .env.
  ...[
    "AGE_IDENTITY", "AGE_RECIPIENT", "HARLY_ASCII", "HARLY_CLI_TIMEOUT",
    "HARLY_CONFIG_DIR", "HARLY_IMAGE_REF", "HARLY_NO_UPDATE_CHECK",
    "HARLY_ORGANIZATION", "HARLY_PROXY_MODE", "HARLY_REQUIRED_DISK_GB",
    "HARLY_RESOURCE_PROFILE", "HARLY_TELEMETRY", "HARLY_TELEMETRY_URL",
  ].map((name) => [name, "CLI-only setting (apps/docs/deployment/cli.mdx)"]),
  // Set by the Docker image or by compose.yaml itself.
  ...["HARLY_CACHE_DIR", "HARLY_INTERNAL_URL", "HARLY_MIGRATIONS_DIR", "HARLY_SERVER_PATH"]
    .map((name) => [name, "set by the container image"]),
  // Build-time, test-only or developer-tooling variables.
  ["HARLY_DISABLE_WEBPACK_BUILD_WORKER", "build-only"],
  ["NEXT_PUBLIC_HARLY_VERSION", "build-time fallback; HARLY_VERSION is the runtime setting"],
  ["HARLY_E2E", "test-only"],
  ["HARLY_TEST_APP", "test-only"],
  ["HARLY_SSE_CONNECTIONS", "smoke-test script only"],
  ["HARLY_OPENAPI_URL", "OpenAPI generation script only"],
  ["HARLY_AI_TOKEN_DEBUG", "developer debugging switch, never for production"],
  // Appears only as an example name inside user-facing text.
  ["HARLY_WEBHOOK_SECRET", "example name shown next to a new webhook secret"],
]);

// Test fixtures and test-only switches (RUN_*_INTEGRATION, HARLY_E2E_*, LIVE_*,
// VPS_*) live in the skipped directories below and in *.test.* files, so they
// need no entry here.
const SKIPPED_DIRECTORIES = new Set([
  "node_modules", ".next", ".turbo", ".git", "dist", "build", "coverage",
  "test", "tests", "__tests__", "e2e", "test-support",
]);
// apps/telemetry is a separate deployable with its own settings (see its README).
const SKIPPED_PATHS = new Set(["apps/telemetry", "apps/docs", "docs"]);
const SOURCE_FILE = /\.(?:[cm]?[jt]s|tsx)$/;
const TEST_FILE = /\.(?:test|spec)\.|\.d\.ts$|\.integration\./;

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(root, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name) || SKIPPED_PATHS.has(relative)) continue;
      yield* sourceFiles(full);
    } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      yield full;
    }
  }
}

// process.env.NAME, process.env["NAME"], env.NAME / source.NAME on an env
// object, and helpers that take the name as a string literal.
const NAME = "[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+";
const PATTERNS = [
  new RegExp(`process\\.env\\.(${NAME})\\b`, "g"),
  new RegExp(`process\\.env\\[\\s*["'\`](${NAME})["'\`]`, "g"),
  new RegExp(`\\b(?:env|source)\\??\\.(${NAME})\\b`, "g"),
  new RegExp(`\\b(?:positiveInteger|read)\\(\\s*["'](${NAME})["']`, "g"),
];

/** Environment variable names the product reads, with a file that reads each. */
function readEnvironmentNames() {
  const found = new Map();
  for (const base of ["apps", "packages", "tooling"]) {
    for (const file of sourceFiles(path.join(root, base))) {
      const text = readFileSync(file, "utf8");
      for (const pattern of PATTERNS) {
        for (const match of text.matchAll(pattern)) {
          if (!found.has(match[1])) found.set(match[1], path.relative(root, file));
        }
      }
    }
  }
  return found;
}

function documentedNames(file) {
  const text = readFileSync(path.join(root, file), "utf8");
  return new Set(text.match(new RegExp(`\\b${NAME}\\b`, "g")));
}

const names = readEnvironmentNames();
const operatorNames = [...names].filter(([name]) => !ALLOWLIST.has(name));

function report(missing, where, fix) {
  return [
    `${missing.length} environment variable(s) are read by the code but missing from ${where}:`,
    ...missing.map(([name, file]) => `  - ${name}  (read in ${file})`),
    fix,
  ].join("\n");
}

test("the scan finds the variables it is meant to guard", () => {
  for (const name of ["HARLY_URL", "BETTER_AUTH_SECRET", "RATE_LIMIT_STORE", "HARLY_DB_POOL_MAX", "LOG_LEVEL"]) {
    assert.ok(names.has(name), `${name} should be found by the scan; the patterns may have broken`);
  }
});

test(".env.example lists every environment variable the code reads", () => {
  const listed = documentedNames(".env.example");
  const missing = operatorNames.filter(([name]) => !listed.has(name));
  assert.equal(
    missing.length,
    0,
    report(missing, ".env.example", "Add each to .env.example with a safe placeholder, or put it in ALLOWLIST in tooling/scripts/env-parity.test.mjs with the reason."),
  );
});

test("configuration.mdx describes every environment variable the code reads", () => {
  const documented = documentedNames("apps/docs/deployment/configuration.mdx");
  const missing = operatorNames.filter(([name]) => !documented.has(name));
  assert.equal(
    missing.length,
    0,
    report(missing, "apps/docs/deployment/configuration.mdx", "Describe each in apps/docs/deployment/configuration.mdx, or put it in ALLOWLIST in tooling/scripts/env-parity.test.mjs with the reason."),
  );
});

test("every allowlisted name is still read by the code", () => {
  const stale = [...ALLOWLIST.keys()].filter((name) => !names.has(name));
  // Names such as PATH are read through helpers the scan does not follow, and
  // some entries only appear in files the scan skips. Only flag entries that
  // appear nowhere in the repository's source at all.
  const unused = stale.filter((name) => !anywhereInSource(name));
  assert.deepEqual(unused, [], `Remove from ALLOWLIST (no longer referenced): ${unused.join(", ")}`);
});

function anywhereInSource(name) {
  for (const base of ["apps", "packages", "tooling"]) {
    for (const file of sourceFiles(path.join(root, base))) {
      if (readFileSync(file, "utf8").includes(name)) return true;
    }
  }
  return false;
}
