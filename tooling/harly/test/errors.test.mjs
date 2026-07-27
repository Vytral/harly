import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Dev machines and CI runners don't always have the 5 GB the installer
// recommends. Tests run with the floor disabled so a full /tmp doesn't
// break the suite.
process.env.HARLY_REQUIRED_DISK_GB = "0";

const packageRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(packageRoot, "dist", "index.js");

async function makeFakeDocker(script) {
  const bin = await mkdtemp(path.join(os.tmpdir(), "harly-fake-bin-"));
  const file = path.join(bin, "docker");
  await writeFile(file, script, { mode: 0o755 });
  return bin;
}

async function holdPort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

test("Help text lists the new deploy subcommand", () => {
  const result = spawnSync(process.execPath, [cli, "help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /harly deploy <railway\|fly\|digitalocean>/,
  );
});

test("`harly deploy` without a provider fails with a clear message", () => {
  const result = spawnSync(process.execPath, [cli, "deploy"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /needs one of: railway, fly, digitalocean/);
});

test("`harly deploy vercel` is rejected (Vercel is not supported)", () => {
  const result = spawnSync(process.execPath, [cli, "deploy", "vercel"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /needs one of: railway, fly, digitalocean/);
});

test("Welcome menu no longer offers cloud providers as first-class options", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path.join(packageRoot, "src/index.ts"), "utf8"),
  );
  const menuBlock = source.match(/async function menu\([\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.ok(menuBlock.length > 0, "could not locate menu() in source");
  for (const value of ["railway", "fly", "digitalocean"]) {
    assert.doesNotMatch(
      menuBlock,
      new RegExp(`value:\\s*["']${value}["']`),
      `menu() still exposes ${value} as a top-level option`,
    );
  }
  // The deploy subcommand still wires them up explicitly.
  assert.match(source, /case "railway":[\s\S]*?return railwayGuide\(\)/);
  assert.match(source, /case "fly":[\s\S]*?return cloudGuide\("fly"\)/);
  assert.match(
    source,
    /case "digitalocean":[\s\S]*?return cloudGuide\("digitalocean"\)/,
  );
});

test("Interactive flow no longer prints 'Welcome to Harly' inside init", async () => {
  // The ASCII brand is fine once, but a second p.intro with the same words is
  // what made the install flow look like two separate wizards.
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path.join(packageRoot, "src/index.ts"), "utf8"),
  );
  const initBlock =
    source.match(/async function collectInteractiveAnswers[\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.ok(initBlock.length > 0, "could not locate collectInteractiveAnswers");
  assert.doesNotMatch(initBlock, /p\.intro\(/);
  assert.doesNotMatch(initBlock, /accentBadge/);
});

test("Non-interactive init with a busy port 80 surfaces an actionable error", async () => {
  const hold = await holdPort(80).catch(() => null);
  if (!hold) {
    // Port 80 may not be bindable in this environment; the e2e layer covers
    // it on real Linux. Skip rather than fail the suite.
    return;
  }
  const bin = await makeFakeDocker(`#!/bin/sh
if [ "$1 $2 $3" = "version --format {{.Server.Version}}" ]; then echo 24.0.0; fi
if [ "$1 $2 $3" = "compose version --short" ]; then echo 2.20.0; fi
exit 0
`);
  try {
    const result = spawnSync(process.execPath, [cli, "init"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HARLY_PROXY_MODE: "caddy",
        HARLY_URL: "https://careers.example.com",
        HARLY_INITIAL_ADMIN_EMAIL: "owner@example.com",
      },
    });
    assert.equal(result.status, 1);
    const combined = `${result.stdout}${result.stderr}`;
    assert.match(combined, /Required port is in use/i);
    assert.match(combined, /TCP 80/);
    assert.match(combined, /HARLY_PROXY_MODE=external/);
  } finally {
    hold.close();
    await rm(bin, { recursive: true, force: true });
  }
});

test("Non-interactive init with a missing docker daemon reports a clear reason", async () => {
  const bin = await makeFakeDocker(`#!/bin/sh
echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" 1>&2
exit 1
`);
  try {
    const result = spawnSync(process.execPath, [cli, "init"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HARLY_PROXY_MODE: "local",
        HARLY_URL: "http://127.0.0.1:3000",
        HARLY_INITIAL_ADMIN_EMAIL: "owner@example.com",
      },
    });
    assert.notEqual(result.status, 0);
    const combined = `${result.stdout}${result.stderr}`;
    assert.match(combined, /Docker is not ready/i);
    assert.match(combined, /start the Docker daemon|systemctl start docker/i);
  } finally {
    await rm(bin, { recursive: true, force: true });
  }
});

test("`harly check` runs without installing anything and prints the requirements table", async () => {
  const bin = await makeFakeDocker(`#!/bin/sh
if [ "$1 $2 $3" = "version --format {{.Server.Version}}" ]; then echo 24.0.0; fi
if [ "$1 $2 $3" = "compose version --short" ]; then echo 2.20.0; fi
exit 0
`);
  try {
    const result = spawnSync(process.execPath, [cli, "check"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CI: "1" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Harly self-host requirements/);
    assert.match(result.stdout, /Host\b/);
    assert.match(result.stdout, /Docker\b/);
    assert.match(result.stdout, /Compose\b/);
    assert.match(result.stdout, /Disk\b/);
    // No installation should be created in cwd by `check`.
    const cwdFiles = await import("node:fs/promises").then(({ readdir }) =>
      readdir(process.cwd()).catch(() => []),
    );
    assert.ok(
      !cwdFiles.includes("harly.config.json"),
      "check must not generate a Harly installation",
    );
  } finally {
    await rm(bin, { recursive: true, force: true });
  }
});

test("`harly check` detects a ufw firewall that is blocking the public ports", async () => {
  const fakeBin = await makeFakeDocker(`#!/bin/sh
if [ "$1 $2 $3" = "version --format {{.Server.Version}}" ]; then echo 24.0.0; fi
if [ "$1 $2 $3" = "compose version --short" ]; then echo 2.20.0; fi
exit 0
`);
  const ufwPath = path.join(fakeBin, "ufw");
  await writeFile(
    ufwPath,
    `#!/bin/sh
echo "Status: active"
echo "To                         Action      From"
echo "--                         ------      ----"
echo "22/tcp                     ALLOW       Anywhere"
exit 0
`,
    { mode: 0o755 },
  );
  try {
    const result = spawnSync(process.execPath, [cli, "check"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        CI: "1",
      },
    });
    const output = result.stdout;
    assert.match(output, /Firewall/);
    assert.match(output, /ufw is active/);
    assert.match(output, /ufw allow 80\/tcp && ufw allow 443\/tcp/);
    assert.notEqual(result.status, 0);
  } finally {
    await rm(fakeBin, { recursive: true, force: true });
  }
});

test("Init non-interactive output includes the setup secret for copy-paste", async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), "harly-init-secret-"));
  const bin = await makeFakeDocker(`#!/bin/sh
if [ "$1 $2 $3" = "version --format {{.Server.Version}}" ]; then echo 24.0.0; fi
if [ "$1 $2 $3" = "compose version --short" ]; then echo 2.20.0; fi
exit 0
`);
  try {
    const result = spawnSync(
      process.execPath,
      [cli, "init", target],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          HARLY_PROXY_MODE: "local",
          HARLY_URL: "http://127.0.0.1:3000",
          HARLY_INITIAL_ADMIN_EMAIL: "owner@example.com",
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    // The setup secret is in stdout (non-interactive) so the user can copy
    // it without opening .env. It must be a 32+ char random string.
    const match = result.stdout.match(/Setup secret: (\S+)/);
    assert.ok(match, `stdout should include "Setup secret:"; got: ${result.stdout}`);
    const secret = match[1];
    assert.ok(secret.length >= 32, `secret is too short: ${secret}`);
    // And it must match what was written to .env.
    const env = await import("node:fs/promises").then(({ readFile }) =>
      readFile(path.join(target, ".env"), "utf8"),
    );
    const envMatch = env.match(/^HARLY_SETUP_SECRET="([^"]+)"$/m);
    assert.ok(envMatch);
    assert.equal(envMatch[1], secret);
    // .env mode must be 0600.
    const stat_ = await import("node:fs/promises").then(({ stat }) =>
      stat(path.join(target, ".env")),
    );
    assert.equal(stat_.mode & 0o777, 0o600);
  } finally {
    await rm(target, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("detectResourceProfile uses free memory, not total memory", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path.join(packageRoot, "src/index.ts"), "utf8"),
  );
  const fn =
    source.match(/function detectResourceProfile\(\)[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(fn.length > 0, "detectResourceProfile not found");
  assert.match(fn, /os\.freemem/);
  assert.doesNotMatch(fn, /os\.totalmem/);
});

test("DNS retry loop exists in interactive mode with a 5 minute budget", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path.join(packageRoot, "src/errors.ts"), "utf8"),
  );
  const dnsBlock = source.match(/class DnsFailure[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(dnsBlock.length > 0);
  assert.match(dnsBlock, /async recover/);
  assert.match(dnsBlock, /5 \* 60 \* 1000/);
  assert.match(dnsBlock, /15_000/);
  assert.match(dnsBlock, /120_000/);
  assert.match(dnsBlock, /attemptResolve/);
  assert.match(dnsBlock, /Wait \$\{label\}/);
});

test("`harly setup-secret` reads HARLY_SETUP_SECRET from .env without opening the file", async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), "harly-setup-secret-"));
  try {
    const env = `HARLY_SETUP_SECRET="abc123-example-secret-value-xyz"\nHARLY_URL="https://careers.example.com"\n`;
    await writeFile(path.join(target, ".env"), env, { mode: 0o600 });
    const result = spawnSync(process.execPath, [cli, "setup-secret", target], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "abc123-example-secret-value-xyz\n");
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test("`harly setup-secret` fails clearly when no .env is found", () => {
  const result = spawnSync(
    process.execPath,
    [cli, "setup-secret", "/nonexistent-path-harly-test"],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No \.env file found|Run .harly init/);
});

test("`harly init --dry-run` does not write any files but lists what would be created", async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), "harly-dry-run-"));
  const bin = await makeFakeDocker(`#!/bin/sh
if [ "$1 $2 $3" = "version --format {{.Server.Version}}" ]; then echo 24.0.0; fi
if [ "$1 $2 $3" = "compose version --short" ]; then echo 2.20.0; fi
exit 0
`);
  try {
    const result = spawnSync(
      process.execPath,
      [cli, "init", target, "--dry-run"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          HARLY_PROXY_MODE: "local",
          HARLY_URL: "http://127.0.0.1:3000",
          HARLY_INITIAL_ADMIN_EMAIL: "owner@example.com",
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Dry run/);
    assert.match(result.stdout, /no files were written/i);
    for (const file of [
      "compose.yaml",
      "Caddyfile",
      ".env.example",
      ".gitignore",
      "harly.config.json",
      "README.md",
      ".env",
    ]) {
      assert.ok(
        result.stdout.includes(`+ ${file}`),
        `dry-run output should list ${file}`,
      );
    }
    // No files were actually written.
    const written = await import("node:fs/promises").then(({ readdir }) =>
      readdir(target).catch(() => []),
    );
    assert.deepEqual(written, [], "dry-run must not write any files");
  } finally {
    await rm(target, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("Launch polls each service individually for per-service timing", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path.join(packageRoot, "src/index.ts"), "utf8"),
  );
  const launchBlock = source.match(/async function launch\([\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.ok(launchBlock.length > 0);
  // The old macro spinner is gone; each service gets its own wait + duration.
  assert.doesNotMatch(
    launchBlock,
    /Starting Harly and waiting for healthchecks/,
  );
  assert.match(launchBlock, /waitForService/);
  assert.match(launchBlock, /postgres/);
  assert.match(launchBlock, /migrate/);
  assert.match(launchBlock, /app/);
  assert.match(launchBlock, /scheduler/);
  assert.match(launchBlock, /caddy/);
  assert.match(launchBlock, /formatLaunchLine/);
});

test("`harly doctor --fix` is wired into the command without breaking non-fix mode", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path.join(packageRoot, "src/index.ts"), "utf8"),
  );
  assert.match(source, /runDoctorFix/);
  assert.match(source, /flags\.has\("--fix"\)/);
  // Help text advertises the flag.
  const help = spawnSync(process.execPath, [cli, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--fix/);
});
