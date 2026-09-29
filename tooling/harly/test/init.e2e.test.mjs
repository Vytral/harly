import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import test from "node:test";

process.env.HARLY_REQUIRED_DISK_GB = "0";

const packageRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(packageRoot, "dist", "index.js");
const dockerAvailable =
  spawnSync("docker", ["version"], { stdio: "ignore" }).status === 0;

test("version flag reports the published CLI version", async () => {
  const result = spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  // Assert against package.json rather than a literal: the failure this needs
  // to catch is the in-source constant drifting from the published version,
  // and a hardcoded string here would have to be edited on every bump.
  const { version } = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  assert.equal(result.stdout, `${version}\n`);
});

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

test(
  "init creates a secure, valid installation in an empty directory",
  { skip: !dockerAvailable },
  async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "harly-init-e2e-"));
  const target = path.join(parent, "installation");
  const port = await availablePort();

  try {
    const result = spawnSync(process.execPath, [cli, "init", target], {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        HARLY_PROXY_MODE: "local",
        HARLY_URL: `http://localhost:${port}`,
        HARLY_INITIAL_ADMIN_EMAIL: "owner@example.com",
        HARLY_ORGANIZATION: "Harly E2E",
        HARLY_RESOURCE_PROFILE: "compact",
        STORAGE_PROVIDER: "local",
        HARLY_IMAGE_REF: "ghcr.io/vytral/harly:0.1.0",
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const expectedFiles = [
      ".env",
      ".env.example",
      ".gitignore",
      "Caddyfile",
      "README.md",
      "compose.yaml",
      "harly.config.json",
    ];
    await Promise.all(expectedFiles.map((file) => stat(path.join(target, file))));

    const envStat = await stat(path.join(target, ".env"));
    assert.equal(envStat.mode & 0o777, 0o600);

    const env = await readFile(path.join(target, ".env"), "utf8");
    const secrets = [
      "BETTER_AUTH_SECRET",
      "AI_ENCRYPTION_KEY",
      "STORAGE_UPLOAD_SECRET",
      "CRON_SECRET",
      "HARLY_SETUP_SECRET",
    ].map((name) => env.match(new RegExp(`^${name}="([^"]+)"$`, "m"))?.[1]);
    assert.ok(secrets.every((secret) => secret && secret.length >= 32));
    assert.equal(new Set(secrets).size, secrets.length);

    const config = JSON.parse(await readFile(path.join(target, "harly.config.json"), "utf8"));
    assert.equal(config.proxyMode, "local");
    assert.equal(config.publicUrl, `http://localhost:${port}`);
    assert.equal(config.image, "ghcr.io/vytral/harly:0.1.0");
    assert.equal(config.resourceProfile, "compact");

    assert.match(env, /^HARLY_APP_MEMORY=1024m$/m);
    assert.match(env, /^HARLY_POSTGRES_MEMORY=384m$/m);
    assert.match(env, new RegExp(`^HARLY_PORT="${port}"$`, "m"));

    const compose = await readFile(path.join(target, "compose.yaml"), "utf8");
    assert.match(compose, /services:\n/);
    assert.match(compose, /postgres:/);
    assert.match(compose, /scheduler:/);
    assert.match(compose, /profiles: \[proxy\]/);

    const composeConfig = spawnSync(
      "docker",
      ["compose", "--project-directory", target, "-f", path.join(target, "compose.yaml"), "config", "--format", "json"],
      { cwd: target, encoding: "utf8" },
    );
    assert.equal(composeConfig.status, 0, composeConfig.stderr || composeConfig.stdout);
    const resolvedCompose = JSON.parse(composeConfig.stdout);
    assert.deepEqual(resolvedCompose.services.app.tmpfs, ["/tmp:size=256m,mode=1777"]);
    assert.deepEqual(resolvedCompose.services.scheduler.tmpfs, ["/tmp:size=64m,mode=1777"]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
  },
);

test("launch requires --yes when stdin is not interactive", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "harly-launch-e2e-"));
  try {
    await writeFile(path.join(directory, "harly.config.json"), JSON.stringify({
      version: 1,
      proxyMode: "local",
      publicUrl: "http://localhost:3000",
      image: "ghcr.io/vytral/harly:0.1.0-test",
      organizationName: "Harly E2E",
      initialAdminEmail: "owner@example.com",
      storage: "local",
    }));

    const result = spawnSync(process.execPath, [cli, "launch", directory], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /--yes is required in non-interactive mode/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("no-argument CLI detects an installation from a child directory", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "harly-menu-e2e-"));
  const child = path.join(directory, "nested", "work");
  const bin = path.join(directory, "bin");
  await mkdir(child, { recursive: true });
  await mkdir(bin);
  await writeFile(path.join(directory, "harly.config.json"), JSON.stringify({
    version: 1, proxyMode: "local", publicUrl: "http://127.0.0.1:1",
    image: "ghcr.io/vytral/harly:0.1.0-test", organizationName: "Harly E2E",
    initialAdminEmail: "owner@example.com", storage: "local", resourceProfile: "compact",
  }));
  await writeFile(path.join(bin, "docker"), `#!/bin/sh
if [ "$1 $2 $3 $4" = "compose ps --status running" ]; then printf 'postgres\\napp\\nscheduler\\n'; fi
exit 0
`);
  await chmod(path.join(bin, "docker"), 0o755);
  try {
    const result = spawnSync(process.execPath, [cli], {
      cwd: child, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    // Automation parses these keys, so a non-interactive run must keep them
    // even though the interactive render drops them as noise.
    assert.match(result.stdout, /service:postgres/);
    assert.match(result.stdout, /readiness/);
    assert.doesNotMatch(result.stdout, /Advanced commands/);

    // The --json document is the automation contract: stable machine keys,
    // plus the human label alongside them.
    const asJson = spawnSync(process.execPath, [cli, "doctor", directory, "--json"], {
      cwd: child, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    const report = JSON.parse(asJson.stdout);
    assert.deepEqual(
      report.checks.map((check) => check.name),
      ["compose", "service:postgres", "service:app", "service:scheduler", "profile:caddy", "readiness"],
    );
    assert.ok(report.checks.every((check) => typeof check.label === "string"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("backup creates a private local rollback archive when encryption is not configured", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "harly-backup-e2e-"));
  const bin = path.join(directory, "bin");
  await mkdir(bin);
  await writeFile(path.join(directory, "harly.config.json"), JSON.stringify({
    version: 1, proxyMode: "local", publicUrl: "http://localhost:3000",
    image: "ghcr.io/vytral/harly:0.1.0-test", organizationName: "Harly E2E",
    initialAdminEmail: "owner@example.com", storage: "s3", resourceProfile: "compact",
  }));
  await writeFile(path.join(directory, ".env"), "POSTGRES_USER=\"harly\"\nPOSTGRES_DB=\"harly\"\n", { mode: 0o600 });
  await writeFile(path.join(bin, "docker"), `#!/bin/sh
if [ "$1 $2 $3 $4" = "compose exec -T" ]; then printf 'fake-pg-dump'; fi
exit 0
`);
  await chmod(path.join(bin, "docker"), 0o755);
  try {
    const result = spawnSync(process.execPath, [cli, "backup", directory], {
      cwd: packageRoot, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, AGE_RECIPIENT: "" },
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /harly-.*\.tar\.gz/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("upgrade preserves data, pins the pulled digest, migrates, and waits for health", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "harly-upgrade-e2e-"));
  const bin = path.join(directory, "bin");
  const calls = path.join(directory, "docker.calls");
  const port = await availablePort();
  await mkdir(bin);
  await writeFile(path.join(directory, "harly.config.json"), JSON.stringify({
    version: 1,
    proxyMode: "local",
    publicUrl: `http://127.0.0.1:${port}`,
    image: "ghcr.io/vytral/harly:0.1.0",
    organizationName: "Harly E2E",
    initialAdminEmail: "owner@example.com",
    storage: "local",
    resourceProfile: "compact",
  }));
  await writeFile(path.join(directory, ".env"), "HARLY_IMAGE=\"ghcr.io/vytral/harly:0.1.0\"\nHARLY_VERSION=\"0.1.0\"\n", { mode: 0o600 });
  await writeFile(path.join(bin, "docker"), `#!/bin/sh
echo "$*" >> "${calls}"
if [ "$1 $2" = "version --format" ]; then echo 29.0.0; exit 0; fi
if [ "$1 $2 $3" = "compose version --short" ]; then echo 2.40.0; exit 0; fi
if [ "$1 $2 $3" = "compose exec -T" ]; then printf 'fake-pg-dump'; exit 0; fi
if [ "$1 $2" = "image inspect" ]; then echo 'ghcr.io/vytral/harly@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; exit 0; fi
if [ "$1 $2 $3 $4" = "compose ps --status running" ]; then printf 'postgres\\napp\\nscheduler\\n'; exit 0; fi
exit 0
`);
  await chmod(path.join(bin, "docker"), 0o755);
  const server = spawn(process.execPath, ["-e", `require('http').createServer((_,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end('{"status":"ok"}')}).listen(${port},'127.0.0.1')`], { stdio: "ignore" });
  await new Promise((resolve) => setTimeout(resolve, 150));

  try {
    const result = spawnSync(process.execPath, [cli, "update", directory, "--to", "0.2.0", "--yes", "--allow-plaintext"], {
      cwd: packageRoot,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const env = await readFile(path.join(directory, ".env"), "utf8");
    assert.match(env, /HARLY_IMAGE="ghcr\.io\/vytral\/harly@sha256:a{64}"/);
    const config = JSON.parse(await readFile(path.join(directory, "harly.config.json"), "utf8"));
    assert.equal(config.requestedImage, "ghcr.io/vytral/harly:0.2.0");
    assert.equal(config.image, `ghcr.io/vytral/harly@sha256:${"a".repeat(64)}`);
    const dockerCalls = await readFile(calls, "utf8");
    assert.match(dockerCalls, /compose pull app migrate scheduler/);
    assert.match(dockerCalls, /compose run --rm migrate/);
    assert.match(dockerCalls, /compose up -d --wait --wait-timeout 180/);
    const backupFiles = await import("node:fs/promises").then(({ readdir }) => readdir(path.join(directory, "backups")));
    assert.equal(backupFiles.length, 1);
    const backupStat = await stat(path.join(directory, "backups", backupFiles[0]));
    assert.equal(backupStat.mode & 0o777, 0o600);
  } finally {
    server.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

const stableDigest = `sha256:${"b".repeat(64)}`;

function manifestServer(version = "0.2.0", digest = stableDigest) {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((_, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        schemaVersion: 1,
        version,
        image: "ghcr.io/vytral/harly",
        digest,
      }));
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/release-manifest.json`,
      });
    });
  });
}

function runCli(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], options);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function resumeFixture(t, { failures = 0, caddyState = { State: "running", Health: "" } } = {}) {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), "harly-resume-e2e-")));
  const directory = path.join(parent, "harly");
  const bin = path.join(parent, "bin");
  const calls = path.join(parent, "docker.calls");
  await mkdir(directory);
  await mkdir(bin);
  const requests = [];
  const server = createHttpServer((request, response) => {
    requests.push(request.url);
    response.writeHead(requests.length <= failures ? 503 : 200);
    response.end("ready");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(parent, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const files = {
    "harly.config.json": JSON.stringify({
      version: 1, proxyMode: "caddy", publicUrl: url,
      image: "ghcr.io/vytral/harly:0.2.0", organizationName: "Saved organization",
      initialAdminEmail: "saved@example.com", storage: "local", resourceProfile: "standard",
    }),
    ".env": 'HARLY_SETUP_SECRET="saved-secret"\nPOSTGRES_PASSWORD="saved-password"\n',
    "compose.yaml": "# Saved operator configuration\nservices: {}\n",
    "Caddyfile": "# Saved operator proxy configuration\n",
  };
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(path.join(directory, name), contents, { mode: 0o600 });
  }
  await writeFile(path.join(bin, "docker"), `#!/bin/sh
printf '%s|%s\\n' "$PWD" "$*" >> "$HARLY_TEST_DOCKER_CALLS"
if [ "$1 $2" = "compose up" ] && [ "$HARLY_TEST_UP_FAILURE" = "1" ]; then
  echo 'simulated startup failure' >&2
  exit 1
fi
if [ "$1 $2" = "compose ps" ]; then
  case "$6" in
    migrate) echo '{"State":"exited","ExitCode":0}' ;;
    caddy) printf '%s\\n' "$HARLY_TEST_CADDY_STATE" ;;
    *) echo '{"State":"running","Health":"healthy"}' ;;
  esac
fi
exit 0
`);
  await chmod(path.join(bin, "docker"), 0o755);
  async function run(args, extra = {}) {
    return runCli(args, {
      cwd: extra.cwd ?? parent, timeout: 8_000,
      env: {
        ...process.env, PATH: `${bin}:${process.env.PATH}`,
        HARLY_TEST_DOCKER_CALLS: calls,
        HARLY_TEST_CADDY_STATE: JSON.stringify(caddyState),
        HARLY_TEST_UP_FAILURE: extra.failUp ? "1" : "0",
      },
    });
  }
  async function assertUnchanged() {
    for (const [name, contents] of Object.entries(files)) {
      assert.equal(await readFile(path.join(directory, name), "utf8"), contents);
    }
    assert.equal((await stat(path.join(directory, ".env"))).mode & 0o777, 0o600);
  }
  return { parent, directory, calls, requests, run, assertUnchanged };
}

test("resume finds the default installation, preserves files, and waits for Caddy public readiness without a healthcheck", async (t) => {
  const fixture = await resumeFixture(t, { failures: 1 });
  const result = await fixture.run(["resume", "--yes", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.command, "resume");
  assert.equal(report.status, "ready");
  assert.equal(report.directory, fixture.directory);
  assert.equal(report.services.caddy, "ready");
  assert.deepEqual(fixture.requests, ["/api/health/ready", "/api/health/ready"]);
  assert.match(result.stderr, /Caddy HTTPS: public endpoint returned HTTP 503/);
  const calls = await readFile(fixture.calls, "utf8");
  assert.ok(calls.indexOf("json scheduler") < calls.indexOf("json caddy"));
  assert.ok(calls.split("\n").filter(Boolean).every((line) => line.startsWith(`${fixture.directory}|`)));
  await fixture.assertUnchanged();
});

test("init --launch reuses existing configuration without asking for inputs", async (t) => {
  const fixture = await resumeFixture(t);
  const result = await fixture.run(["init", fixture.directory, "--launch", "--yes", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).command, "init");
  await fixture.assertUnchanged();
});

test("resume failure provides a recovery command and a retry preserves the installation", async (t) => {
  const fixture = await resumeFixture(t);
  const failed = await fixture.run(["resume", "--yes"], { failUp: true });
  assert.equal(failed.status, 1, failed.stderr || failed.stdout);
  assert.match(failed.stderr, /simulated startup failure/);
  assert.match(failed.stderr, /npx @harly\/cli resume .* --yes/);
  await fixture.assertUnchanged();
  const retry = await fixture.run(["resume", "--yes"]);
  assert.equal(retry.status, 0, retry.stderr || retry.stdout);
  await fixture.assertUnchanged();
});

test("Caddy running alone does not mean readiness when the public endpoint remains unavailable", async (t) => {
  const fixture = await resumeFixture(t, { failures: Infinity });
  const result = await fixture.run(["resume", "--yes", "--json", "--timeout", "1"]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.error.code, "READINESS_TIMEOUT");
  assert.match(report.error.message, /caddy: public HTTPS timeout/);
  assert.match(report.error.message, /HTTP 503/);
  assert.match(report.error.message, /docker compose logs --tail=50 caddy/);
  assert.match(report.error.message, /resume .* --yes/);
  assert.ok(fixture.requests.length > 0);
  await fixture.assertUnchanged();
});

test("Caddy that exits fails even when the public URL responds", async (t) => {
  const fixture = await resumeFixture(t, { caddyState: { State: "exited", ExitCode: 1 } });
  const result = await fixture.run(["resume", "--yes", "--json", "--timeout", "1"]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(JSON.parse(result.stdout).error.message, /caddy: exited 1/);
  assert.equal(fixture.requests.length, 0);
});

test("resume dry-run resolves an enclosing installation without touching Docker", async (t) => {
  const fixture = await resumeFixture(t);
  const nested = path.join(fixture.directory, "nested");
  await mkdir(nested);
  const result = await fixture.run(["resume", "--dry-run", "--json"], { cwd: nested });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.directory, fixture.directory);
  assert.equal(report.sideEffects, false);
  await assert.rejects(stat(fixture.calls), { code: "ENOENT" });
  await fixture.assertUnchanged();
});

test("resume rejects missing saved secrets before starting containers", async (t) => {
  const fixture = await resumeFixture(t);
  await rm(path.join(fixture.directory, ".env"));
  const result = await fixture.run(["resume", "--yes", "--json"]);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(JSON.parse(result.stdout).error.message, /\.env is missing/);
  await assert.rejects(stat(fixture.calls), { code: "ENOENT" });
});

test("resume rejects invalid timeouts before starting containers", async (t) => {
  const fixture = await resumeFixture(t);
  for (const timeout of ["0", "NaN", "1.5", "86401"]) {
    const result = await fixture.run(["resume", "--yes", "--json", "--timeout", timeout]);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).error.code, "INVALID_ARGUMENT");
  }
  await assert.rejects(stat(fixture.calls), { code: "ENOENT" });
});

async function writeInstall(directory, image) {
  await writeFile(path.join(directory, "harly.config.json"), JSON.stringify({
    version: 1,
    proxyMode: "local",
    publicUrl: "http://127.0.0.1:9",
    image,
    organizationName: "Harly E2E",
    initialAdminEmail: "owner@example.com",
    storage: "local",
    resourceProfile: "compact",
  }));
  await writeFile(
    path.join(directory, ".env"),
    `HARLY_IMAGE="${image}"\nHARLY_VERSION="0.1.0"\n`,
    { mode: 0o600 },
  );
}

test("update without --to finds the install and follows the stable manifest", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "harly-update-stable-"));
  const child = path.join(directory, "nested");
  const bin = path.join(directory, "bin");
  const calls = path.join(directory, "docker.calls");
  const port = await availablePort();
  const manifest = await manifestServer();
  await mkdir(bin);
  await mkdir(child);
  await writeInstall(directory, "ghcr.io/vytral/harly:0.1.0");
  const config = JSON.parse(await readFile(path.join(directory, "harly.config.json"), "utf8"));
  config.publicUrl = `http://127.0.0.1:${port}`;
  await writeFile(path.join(directory, "harly.config.json"), JSON.stringify(config));
  await writeFile(path.join(bin, "docker"), `#!/bin/sh
echo "$*" >> "${calls}"
if [ "$1 $2" = "version --format" ]; then echo 29.0.0; exit 0; fi
if [ "$1 $2 $3" = "compose version --short" ]; then echo 2.40.0; exit 0; fi
if [ "$1 $2 $3" = "compose exec -T" ]; then printf 'fake-pg-dump'; exit 0; fi
if [ "$1 $2" = "image inspect" ]; then echo 'ghcr.io/vytral/harly@sha256:${"a".repeat(64)}'; exit 0; fi
if [ "$1 $2 $3 $4" = "compose ps --status running" ]; then printf 'postgres\\napp\\nscheduler\\n'; exit 0; fi
exit 0
`);
  await chmod(path.join(bin, "docker"), 0o755);
  const server = spawn(process.execPath, ["-e", `require('http').createServer((_,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end('{"status":"ok"}')}).listen(${port},'127.0.0.1')`], { stdio: "ignore" });
  await new Promise((resolve) => setTimeout(resolve, 150));
  try {
    const result = await runCli(["update", "--yes", "--allow-plaintext"], {
      cwd: child,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HARLY_RELEASE_MANIFEST_URL: manifest.url,
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const updated = JSON.parse(await readFile(path.join(directory, "harly.config.json"), "utf8"));
    assert.equal(updated.requestedImage, "ghcr.io/vytral/harly:0.2.0");
    assert.equal(updated.image, `ghcr.io/vytral/harly@sha256:${"a".repeat(64)}`);
  } finally {
    server.kill();
    manifest.server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("update does nothing when the install is already on the stable digest", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "harly-update-current-"));
  const manifest = await manifestServer();
  await writeInstall(directory, `ghcr.io/vytral/harly@${stableDigest}`);
  try {
    const result = await runCli(["update", "--yes"], {
      cwd: directory,
      env: { ...process.env, HARLY_RELEASE_MANIFEST_URL: manifest.url },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /already running v0\.2\.0/);
    await assert.rejects(stat(path.join(directory, "backups")));
  } finally {
    manifest.server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("update refuses to downgrade onto an older stable release", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "harly-update-downgrade-"));
  const manifest = await manifestServer("0.2.0");
  await writeInstall(directory, "ghcr.io/vytral/harly:0.3.0");
  try {
    const result = await runCli(["update", "--yes"], {
      cwd: directory,
      env: { ...process.env, HARLY_RELEASE_MANIFEST_URL: manifest.url },
    });
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /will not downgrade/);
  } finally {
    manifest.server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("update --to latest tracks the stable release", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "harly-update-latest-"));
  const manifest = await manifestServer();
  await writeInstall(directory, `ghcr.io/vytral/harly@${stableDigest}`);
  try {
    const result = await runCli(["update", "--to", "latest", "--yes"], {
      cwd: directory,
      env: { ...process.env, HARLY_RELEASE_MANIFEST_URL: manifest.url },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /already running v0\.2\.0/);
  } finally {
    manifest.server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("update rejects edge and a missing installation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "harly-update-reject-"));
  await writeInstall(directory, "ghcr.io/vytral/harly:0.1.0");
  try {
    const edge = spawnSync(process.execPath, [cli, "update", directory, "--to", "edge", "--yes"], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    assert.equal(edge.status, 2, edge.stdout);
    assert.match(edge.stderr, /not a Harly release/);
    const missing = await mkdtemp(path.join(os.tmpdir(), "harly-update-missing-"));
    const result = spawnSync(process.execPath, [cli, "update", "--yes"], {
      cwd: missing,
      encoding: "utf8",
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /No Harly installation found/);
    await rm(missing, { recursive: true, force: true });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
