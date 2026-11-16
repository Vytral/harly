import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

process.env.HARLY_REQUIRED_DISK_GB = "0";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(packageRoot, "../..");
const cli = path.join(packageRoot, "dist", "index.js");

/** Names of every `${VAR...}` Compose interpolation in a compose file. */
function interpolatedVariables(compose) {
  return new Set(
    [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]),
  );
}

async function runInit() {
  const parent = await mkdtemp(path.join(os.tmpdir(), "harly-drift-"));
  const bin = path.join(parent, "bin");
  const target = path.join(parent, "installation");
  await mkdir(bin);
  await writeFile(
    path.join(bin, "docker"),
    `#!/bin/sh
if [ "$1 $2 $3" = "version --format {{.Server.Version}}" ]; then echo 24.0.0; fi
if [ "$1 $2 $3" = "compose version --short" ]; then echo 2.20.0; fi
exit 0
`,
    { mode: 0o755 },
  );
  const result = spawnSync(process.execPath, [cli, "init", target], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HARLY_PROXY_MODE: "local",
      HARLY_URL: "http://localhost:3999",
      HARLY_INITIAL_ADMIN_EMAIL: "owner@example.com",
      HARLY_ORGANIZATION: "Drift Test",
      HARLY_RESOURCE_PROFILE: "compact",
      STORAGE_PROVIDER: "local",
      HARLY_IMAGE_REF: "ghcr.io/vytral/harly:0.1.0",
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { parent, target };
}

test("harly init writes the repository compose.yaml and documents every variable it reads", async () => {
  const { parent, target } = await runInit();
  try {
    const rootCompose = await readFile(path.join(repoRoot, "compose.yaml"), "utf8");
    const generated = await readFile(path.join(target, "compose.yaml"), "utf8");
    assert.equal(
      generated,
      rootCompose,
      "The compose.yaml written by `harly init` must equal the repository compose.yaml. Rebuild the CLI (`pnpm --filter @harly/cli build`).",
    );

    const envExample = await readFile(path.join(target, ".env.example"), "utf8");
    const documented = new Set(
      [...envExample.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
    );
    const missing = [...interpolatedVariables(rootCompose)]
      .filter((name) => !documented.has(name))
      .sort();
    assert.deepEqual(
      missing,
      [],
      `compose.yaml reads variables that the generated .env.example does not list: ${missing.join(", ")}. Add them to envExampleWithEsign in tooling/harly/src/index.ts.`,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("harly init generates a secret for the bundled e-signature service", async () => {
  const { parent, target } = await runInit();
  try {
    const env = await readFile(path.join(target, ".env"), "utf8");
    const value = env.match(/^DOCUSEAL_SECRET_KEY_BASE="([^"]+)"$/m)?.[1];
    assert.ok(value && value.length >= 32, "DOCUSEAL_SECRET_KEY_BASE must be generated");
    const compose = await readFile(path.join(target, "compose.yaml"), "utf8");
    assert.match(compose, /^ {2}docuseal:$/m);
    assert.match(compose, /profiles: \["esign"\]/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the generated .env only sets variables the compose file reads", async () => {
  const { parent, target } = await runInit();
  try {
    const compose = await readFile(path.join(target, "compose.yaml"), "utf8");
    const known = interpolatedVariables(compose);
    // Read by Compose itself or by the CLI rather than by a service.
    const cliOwned = new Set(["COMPOSE_PROFILES"]);
    const env = await readFile(path.join(target, ".env"), "utf8");
    const unknown = [...env.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)]
      .map((match) => match[1])
      .filter((name) => !known.has(name) && !cliOwned.has(name));
    assert.deepEqual(unknown, [], `.env sets variables no service reads: ${unknown.join(", ")}`);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
