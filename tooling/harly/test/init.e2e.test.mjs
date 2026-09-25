import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
      ["compose", "--project-directory", target, "-f", path.join(target, "compose.yaml"), "config", "--quiet"],
      { cwd: target, encoding: "utf8" },
    );
    assert.equal(composeConfig.status, 0, composeConfig.stderr || composeConfig.stdout);
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
