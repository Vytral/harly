import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(packageRoot, "dist", "index.js");

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

test("init creates a secure, valid installation in an empty directory", async () => {
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
        HARLY_IMAGE_REF: "ghcr.io/vytral/harly:0.1.0-test",
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
    assert.equal(config.image, "ghcr.io/vytral/harly:0.1.0-test");
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
});

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
    assert.match(result.stdout, /service:postgres/);
    assert.doesNotMatch(result.stdout, /Advanced commands/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("backup requires an explicit plaintext choice when age is not configured", async () => {
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
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AGE_RECIPIENT is required/i);
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
    image: "ghcr.io/vytral/harly:edge",
    organizationName: "Harly E2E",
    initialAdminEmail: "owner@example.com",
    storage: "local",
    resourceProfile: "compact",
  }));
  await writeFile(path.join(directory, ".env"), "HARLY_IMAGE=\"ghcr.io/vytral/harly:edge\"\nHARLY_VERSION=\"edge\"\n", { mode: 0o600 });
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
    const result = spawnSync(process.execPath, [cli, "update", directory, "--to", "edge", "--yes", "--allow-plaintext"], {
      cwd: packageRoot,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const env = await readFile(path.join(directory, ".env"), "utf8");
    assert.match(env, /HARLY_IMAGE="ghcr\.io\/vytral\/harly@sha256:a{64}"/);
    const config = JSON.parse(await readFile(path.join(directory, "harly.config.json"), "utf8"));
    assert.equal(config.requestedImage, "ghcr.io/vytral/harly:edge");
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
