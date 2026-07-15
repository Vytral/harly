#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";

type ProxyMode = "caddy" | "external" | "local";
type HarlyFileConfig = {
  version: 1;
  proxyMode: ProxyMode;
  publicUrl: string;
  image: string;
  organizationName: string;
  initialAdminEmail: string;
  storage: "local" | "s3";
};

class CliError extends Error {
  constructor(message: string, readonly exitCode: 1 | 2 = 1) {
    super(message);
  }
}

const args = process.argv.slice(2);
const command = args.shift() ?? "help";
const flags = new Set(args.filter((arg) => arg.startsWith("--") && !["--to"].includes(arg)));
const positionals = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--to");
const toIndex = args.indexOf("--to");
const toVersion = toIndex >= 0 ? args[toIndex + 1] : undefined;
const force = flags.has("--force");
const yes = flags.has("--yes");
const json = flags.has("--json");

function usage() {
  process.stdout.write(`create-harly — reproducible Harly self-hosting\n\nCommands:\n  create-harly init [directory] [--force]\n  create-harly launch [directory] [--yes]\n  create-harly doctor [directory] [--json]\n  create-harly backup [directory] [--allow-plaintext]\n  create-harly restore <archive> [directory] --force\n  create-harly upgrade [directory] [--to version] [--yes]\n`);
}

function run(program: string, commandArgs: string[], options: { cwd?: string; input?: Buffer; allowFailure?: boolean } = {}) {
  const result = spawnSync(program, commandArgs, {
    cwd: options.cwd,
    input: options.input,
    encoding: options.input ? undefined : "utf8",
    stdio: options.input ? ["pipe", "pipe", "pipe"] : "pipe",
    maxBuffer: 1024 * 1024 * 512,
  });
  if (result.status !== 0 && !options.allowFailure) {
    const message = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new CliError(`${program} ${commandArgs.join(" ")} failed${message ? `: ${message.trim()}` : "."}`);
  }
  return result;
}

function compose(cwd: string, composeArgs: string[], options: { input?: Buffer; allowFailure?: boolean } = {}) {
  return run("docker", ["compose", ...composeArgs], { cwd, ...options });
}

function parseVersion(value: string): number[] {
  return (value.match(/\d+(?:\.\d+)+/)?.[0] ?? "0").split(".").map(Number);
}

function atLeast(actual: number[], expected: number[]): boolean {
  return expected.every((part, index) => (actual[index] ?? 0) === part ? true : (actual[index] ?? 0) > part ? true : expected.slice(0, index).every((item, i) => item === (actual[i] ?? 0)) ? false : true);
}

async function portAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function preflight(mode?: ProxyMode, checkPorts = true) {
  if (!atLeast(parseVersion(process.versions.node), [20, 0, 0])) throw new CliError("Node.js 20 or newer is required.");
  const docker = run("docker", ["version", "--format", "{{.Server.Version}}"], { allowFailure: true });
  if (docker.status !== 0 || !atLeast(parseVersion(String(docker.stdout)), [24, 0, 0])) throw new CliError("Docker Engine 24 or newer is required and must be running.");
  const plugin = run("docker", ["compose", "version", "--short"], { allowFailure: true });
  if (plugin.status !== 0 || !atLeast(parseVersion(String(plugin.stdout)), [2, 20, 0])) throw new CliError("Docker Compose 2.20 or newer is required.");
  if (checkPorts) {
    const ports = mode === "caddy" ? [80, 443] : [Number(process.env.HARLY_PORT ?? 3000)];
    for (const port of ports) if (!(await portAvailable(port))) throw new CliError(`Port ${port} is already in use.`);
  }
}

async function prompt(question: string, fallback?: string): Promise<string> {
  if (!process.stdin.isTTY) {
    if (fallback !== undefined) return fallback;
    throw new CliError(`${question} is required in non-interactive mode.`, 2);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question}${fallback ? ` (${fallback})` : ""}: `)).trim();
    return answer || fallback || "";
  } finally {
    rl.close();
  }
}

async function confirm(question: string): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) return false;
  return /^y(es)?$/i.test(await prompt(`${question} [y/N]`, "n"));
}

function normalizeUrl(value: string, mode: ProxyMode): URL {
  const candidate = value.includes("://") ? value : `${mode === "local" ? "http" : "https"}://${value}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== "/") throw new CliError("Public URL must be an HTTP(S) origin without a path.", 2);
  if (mode !== "local" && url.protocol !== "https:") throw new CliError("Caddy and external proxy modes require an HTTPS public URL.", 2);
  return url;
}

function secret() {
  return randomBytes(32).toString("base64url");
}

function envLine(value: string): string {
  return JSON.stringify(value);
}

async function atomicWrite(file: string, contents: string, mode?: number) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  await writeFile(temp, contents, { mode });
  await rename(temp, file);
  if (mode) await chmod(file, mode);
}

async function exists(file: string) {
  return stat(file).then(() => true, () => false);
}

const composeTemplate = `name: harly
x-image: &image \${HARLY_IMAGE:?Set HARLY_IMAGE}
x-logging: &logging
  driver: json-file
  options: { max-size: "\${HARLY_LOG_MAX_SIZE:-10m}", max-file: "\${HARLY_LOG_MAX_FILES:-3}" }
x-env: &env
  NODE_ENV: production
  HARLY_URL: \${HARLY_URL:?Set HARLY_URL}
  NEXT_PUBLIC_APP_URL: \${HARLY_URL:?Set HARLY_URL}
  BETTER_AUTH_URL: \${HARLY_URL:?Set HARLY_URL}
  HARLY_VERSION: \${HARLY_VERSION:?Set HARLY_VERSION}
  DATABASE_URL: postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@postgres:5432/\${POSTGRES_DB}
  BETTER_AUTH_SECRET: \${BETTER_AUTH_SECRET}
  AI_ENCRYPTION_KEY: \${AI_ENCRYPTION_KEY}
  STORAGE_UPLOAD_SECRET: \${STORAGE_UPLOAD_SECRET}
  CRON_SECRET: \${CRON_SECRET}
  HARLY_SETUP_SECRET: \${HARLY_SETUP_SECRET}
  HARLY_INITIAL_ADMIN_EMAIL: \${HARLY_INITIAL_ADMIN_EMAIL}
  STORAGE_PROVIDER: \${STORAGE_PROVIDER:-local}
  UPLOADS_DIR: /data/uploads
  S3_BUCKET: \${S3_BUCKET:-}
  S3_REGION: \${S3_REGION:-}
  S3_ACCESS_KEY_ID: \${S3_ACCESS_KEY_ID:-}
  S3_SECRET_ACCESS_KEY: \${S3_SECRET_ACCESS_KEY:-}
  S3_ENDPOINT: \${S3_ENDPOINT:-}
  S3_PUBLIC_URL: \${S3_PUBLIC_URL:-}
  HARLY_ALLOW_PRIVATE_WEBHOOKS: \${HARLY_ALLOW_PRIVATE_WEBHOOKS:-false}
  RESEND_API_KEY: \${RESEND_API_KEY:-}
  EMAIL_FROM: \${EMAIL_FROM:-}
  HARLY_CACHE_MAX_MB: \${HARLY_CACHE_MAX_MB:-512}
  HARLY_CACHE_MAX_AGE_DAYS: \${HARLY_CACHE_MAX_AGE_DAYS:-7}
services:
  postgres:
    image: postgres:16-bookworm
    restart: unless-stopped
    mem_limit: \${HARLY_POSTGRES_MEMORY:-768m}
    cpus: \${HARLY_POSTGRES_CPUS:-1.0}
    shm_size: 128m
    logging: *logging
    environment: { POSTGRES_USER: "\${POSTGRES_USER}", POSTGRES_PASSWORD: "\${POSTGRES_PASSWORD}", POSTGRES_DB: "\${POSTGRES_DB}" }
    healthcheck: { test: [CMD-SHELL, "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"], interval: 5s, timeout: 3s, retries: 20 }
    volumes: [postgres-data:/var/lib/postgresql/data]
  migrate:
    image: *image
    command: [migrate]
    environment: *env
    depends_on: { postgres: { condition: service_healthy } }
    restart: "no"
    mem_limit: \${HARLY_MIGRATE_MEMORY:-768m}
    cpus: \${HARLY_MIGRATE_CPUS:-1.0}
    logging: *logging
  app:
    image: *image
    command: [serve]
    restart: unless-stopped
    stop_grace_period: 30s
    mem_limit: \${HARLY_APP_MEMORY:-1536m}
    cpus: \${HARLY_APP_CPUS:-2.0}
    logging: *logging
    read_only: true
    tmpfs: [/tmp]
    environment: { <<: *env, NODE_OPTIONS: "\${HARLY_APP_NODE_OPTIONS:---max-old-space-size=1024}" }
    depends_on: { migrate: { condition: service_completed_successfully } }
    ports: ["127.0.0.1:\${HARLY_PORT:-3000}:3000"]
    volumes: [uploads:/data/uploads, next-cache:/app/apps/web/.next/cache]
    healthcheck: { test: [CMD, node, -e, "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"], interval: 10s, timeout: 4s, retries: 12 }
  scheduler:
    image: *image
    command: [scheduler]
    restart: unless-stopped
    stop_grace_period: 30s
    mem_limit: \${HARLY_SCHEDULER_MEMORY:-256m}
    cpus: \${HARLY_SCHEDULER_CPUS:-0.5}
    logging: *logging
    read_only: true
    tmpfs: [/tmp]
    environment: { <<: *env, HARLY_INTERNAL_URL: http://app:3000, NODE_OPTIONS: "\${HARLY_SCHEDULER_NODE_OPTIONS:---max-old-space-size=160}" }
    depends_on: { app: { condition: service_healthy } }
  caddy:
    image: caddy:2.10-alpine
    profiles: [proxy]
    restart: unless-stopped
    mem_limit: \${HARLY_CADDY_MEMORY:-256m}
    cpus: \${HARLY_CADDY_CPUS:-0.5}
    logging: *logging
    environment: { HARLY_DOMAIN: "\${HARLY_DOMAIN:-localhost}" }
    ports: ["80:80", "443:443", "443:443/udp"]
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile:ro", caddy-data:/data, caddy-config:/config]
    depends_on: { app: { condition: service_healthy } }
volumes: { postgres-data: {}, uploads: {}, next-cache: {}, caddy-data: {}, caddy-config: {} }
`;

const envExample = `HARLY_IMAGE=ghcr.io/vytral/harly:<version-or-digest>\nHARLY_VERSION=<version>\nHARLY_URL=https://harly.example.com\nHARLY_PORT=3000\nHARLY_DOMAIN=harly.example.com\nCOMPOSE_PROFILES=proxy\nPOSTGRES_USER=harly\nPOSTGRES_PASSWORD=<secret>\nPOSTGRES_DB=harly\nBETTER_AUTH_SECRET=<secret>\nAI_ENCRYPTION_KEY=<secret>\nSTORAGE_UPLOAD_SECRET=<secret>\nCRON_SECRET=<secret>\nHARLY_SETUP_SECRET=<secret>\nHARLY_INITIAL_ADMIN_EMAIL=owner@example.com\nSTORAGE_PROVIDER=local\nRESEND_API_KEY=\nEMAIL_FROM=\n# Optional resource tuning (defaults target a 4 GB VPS)\nHARLY_APP_MEMORY=1536m\nHARLY_POSTGRES_MEMORY=768m\nHARLY_SCHEDULER_MEMORY=256m\nHARLY_CADDY_MEMORY=256m\nHARLY_CACHE_MAX_MB=512\nHARLY_CACHE_MAX_AGE_DAYS=7\nHARLY_LOG_MAX_SIZE=10m\nHARLY_LOG_MAX_FILES=3\n`;

async function init() {
  const directory = path.resolve(positionals[0] ?? "harly");
  await mkdir(directory, { recursive: true });
  const mode = (await prompt("Proxy mode: caddy, external, or local", process.env.HARLY_PROXY_MODE ?? "caddy")) as ProxyMode;
  if (!["caddy", "external", "local"].includes(mode)) throw new CliError("Invalid proxy mode.", 2);
  await preflight(mode);
  const url = normalizeUrl(await prompt("Public Harly URL", process.env.HARLY_URL), mode);
  if (mode !== "local") await dns.lookup(url.hostname);
  const email = (await prompt("Initial owner email", process.env.HARLY_INITIAL_ADMIN_EMAIL)).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new CliError("Invalid owner email.", 2);
  const organization = await prompt("Organization name", process.env.HARLY_ORGANIZATION ?? "My organization");
  const storage = (await prompt("Storage: local or s3", process.env.STORAGE_PROVIDER ?? "local")) as "local" | "s3";
  if (!['local', 's3'].includes(storage)) throw new CliError("Invalid storage provider.", 2);
  const s3 = storage === "s3"
    ? {
        bucket: await prompt("S3 bucket", process.env.S3_BUCKET),
        region: await prompt("S3 region", process.env.S3_REGION ?? "auto"),
        accessKeyId: await prompt("S3 access key ID", process.env.S3_ACCESS_KEY_ID),
        secretAccessKey: await prompt("S3 secret access key", process.env.S3_SECRET_ACCESS_KEY),
        endpoint: await prompt("S3 endpoint (blank for AWS)", process.env.S3_ENDPOINT ?? ""),
        publicUrl: await prompt("S3 public URL (optional)", process.env.S3_PUBLIC_URL ?? ""),
      }
    : null;
  const image = process.env.HARLY_IMAGE_REF ?? "ghcr.io/vytral/harly:0.1.0-beta.1";
  if (image.endsWith(":latest")) throw new CliError("Installations must pin a version or digest, never latest.", 2);

  const envPath = path.join(directory, ".env");
  if (!(await exists(envPath))) {
    const env = [
      `HARLY_IMAGE=${envLine(image)}`,
      `HARLY_VERSION=${envLine(image.includes("@sha256:") ? "digest" : image.split(":").at(-1) ?? "unknown")}`,
      `HARLY_URL=${envLine(url.origin)}`,
      `HARLY_PORT=${envLine(process.env.HARLY_PORT ?? "3000")}`,
      `HARLY_DOMAIN=${envLine(url.hostname)}`,
      `COMPOSE_PROFILES=${envLine(mode === "caddy" ? "proxy" : "")}`,
      `POSTGRES_USER=${envLine("harly")}`,
      `POSTGRES_PASSWORD=${envLine(secret())}`,
      `POSTGRES_DB=${envLine("harly")}`,
      `BETTER_AUTH_SECRET=${envLine(secret())}`,
      `AI_ENCRYPTION_KEY=${envLine(secret())}`,
      `STORAGE_UPLOAD_SECRET=${envLine(secret())}`,
      `CRON_SECRET=${envLine(secret())}`,
      `HARLY_SETUP_SECRET=${envLine(secret())}`,
      `HARLY_INITIAL_ADMIN_EMAIL=${envLine(email)}`,
      `STORAGE_PROVIDER=${envLine(storage)}`,
      ...(s3 ? [
        `S3_BUCKET=${envLine(s3.bucket)}`,
        `S3_REGION=${envLine(s3.region)}`,
        `S3_ACCESS_KEY_ID=${envLine(s3.accessKeyId)}`,
        `S3_SECRET_ACCESS_KEY=${envLine(s3.secretAccessKey)}`,
        `S3_ENDPOINT=${envLine(s3.endpoint)}`,
        `S3_PUBLIC_URL=${envLine(s3.publicUrl)}`,
      ] : []),
      "RESEND_API_KEY=",
      "EMAIL_FROM=",
      "HARLY_APP_MEMORY=1536m",
      "HARLY_POSTGRES_MEMORY=768m",
      "HARLY_SCHEDULER_MEMORY=256m",
      "HARLY_CADDY_MEMORY=256m",
      "HARLY_CACHE_MAX_MB=512",
      "HARLY_CACHE_MAX_AGE_DAYS=7",
      "HARLY_LOG_MAX_SIZE=10m",
      "HARLY_LOG_MAX_FILES=3",
      "",
    ].join("\n");
    await atomicWrite(envPath, env, 0o600);
  }

  const config: HarlyFileConfig = { version: 1, proxyMode: mode, publicUrl: url.origin, image, organizationName: organization, initialAdminEmail: email, storage };
  const templates: Array<[string, string, number?]> = [
    ["compose.yaml", composeTemplate],
    ["Caddyfile", "{$HARLY_DOMAIN} {\n  encode zstd gzip\n  reverse_proxy app:3000\n}\n"],
    [".env.example", envExample],
    [".gitignore", ".env\nbackups/\n"],
    ["harly.config.json", `${JSON.stringify(config, null, 2)}\n`],
    ["README.md", `# Harly self-host\n\n- Start: \`docker compose up -d\`\n- Diagnose: \`npx @harly/create doctor .\`\n- Backup before every upgrade.\n- Complete the first owner at ${url.origin}/setup using HARLY_SETUP_SECRET from .env.\n`],
  ];
  for (const [name, contents, modeBits] of templates) {
    const target = path.join(directory, name);
    if (!(await exists(target)) || force) await atomicWrite(target, contents, modeBits);
  }
  process.stdout.write(`\nGenerated ${directory}\nImage: ${image}\nMode: ${mode}\nResource profile: 4 GB VPS (override HARLY_*_MEMORY in .env)\nServices: postgres, migrate, app, scheduler${mode === "caddy" ? ", caddy" : ""}\nVolumes: postgres-data, uploads, next-cache${mode === "caddy" ? ", caddy-data, caddy-config" : ""}\n\n`);
  if (await confirm("Pull images and launch now?")) await launch(directory);
}

async function readConfig(directory: string): Promise<HarlyFileConfig> {
  try {
    return JSON.parse(await readFile(path.join(directory, "harly.config.json"), "utf8")) as HarlyFileConfig;
  } catch {
    throw new CliError("harly.config.json is missing or invalid. Run init first.");
  }
}

async function launch(explicitDirectory?: string) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  process.stdout.write(`Image: ${config.image}\nMode: ${config.proxyMode}\nCommands: docker compose pull; docker compose up -d\n`);
  if (!yes && !(await confirm("Continue?"))) {
    if (!process.stdin.isTTY) return;
    throw new CliError("Launch cancelled.", 2);
  }
  compose(directory, ["config", "--quiet"]);
  compose(directory, ["pull"]);
  compose(directory, ["up", "-d"]);
  process.stdout.write(`Harly is starting at ${config.publicUrl}. Run doctor to verify readiness.\n`);
}

async function doctor(explicitDirectory?: string, print = true) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const valid = compose(directory, ["config", "--quiet"], { allowFailure: true });
  checks.push({ name: "compose", ok: valid.status === 0 });
  const servicesResult = compose(directory, ["ps", "--status", "running", "--services"], { allowFailure: true });
  const services = String(servicesResult.stdout ?? "").trim().split(/\s+/).filter(Boolean);
  for (const name of ["postgres", "app", "scheduler", ...(config.proxyMode === "caddy" ? ["caddy"] : [])]) checks.push({ name: `service:${name}`, ok: services.includes(name) });
  checks.push({ name: "profile:caddy", ok: config.proxyMode === "caddy" ? services.includes("caddy") : !services.includes("caddy") });
  try {
    const response = await fetch(`${config.publicUrl}/api/health/ready`, { signal: AbortSignal.timeout(5_000) });
    checks.push({ name: "readiness", ok: response.ok, detail: `HTTP ${response.status}` });
  } catch {
    checks.push({ name: "readiness", ok: false, detail: "unreachable" });
  }
  const result = { ok: checks.every((check) => check.ok), proxyMode: config.proxyMode, image: config.image, checks };
  if (print) process.stdout.write(json ? `${JSON.stringify(result)}\n` : `${checks.map((check) => `${check.ok ? "✓" : "✗"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`).join("\n")}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function backup(explicitDirectory?: string): Promise<string> {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  const temp = await mkdtemp(path.join(os.tmpdir(), "harly-backup-"));
  const outputDirectory = path.join(directory, "backups");
  await mkdir(outputDirectory, { recursive: true });
  compose(directory, ["stop", "app", "scheduler"], { allowFailure: true });
  try {
    const dump = compose(directory, ["exec", "-T", "postgres", "pg_dump", "-U", "harly", "-d", "harly", "-Fc"]);
    const bytes = Buffer.isBuffer(dump.stdout) ? dump.stdout : Buffer.from(dump.stdout);
    await writeFile(path.join(temp, "database.dump"), bytes);
    await cp(path.join(directory, ".env"), path.join(temp, ".env"));
    await cp(path.join(directory, "harly.config.json"), path.join(temp, "harly.config.json"));
    compose(directory, ["cp", "app:/data/uploads/.", path.join(temp, "uploads")], { allowFailure: true });
    const manifest = { version: config.image, createdAt: new Date().toISOString(), files: { "database.dump": sha256(bytes) } };
    await writeFile(path.join(temp, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const archive = path.join(outputDirectory, `harly-${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz`);
    run("tar", ["-czf", archive, "-C", temp, "."]);
    if (flags.has("--allow-plaintext")) {
      process.stdout.write(`${archive}\n`);
      return archive;
    }
    const recipient = process.env.AGE_RECIPIENT;
    if (!recipient) throw new CliError("AGE_RECIPIENT is required unless --allow-plaintext is explicitly set.");
    const encrypted = `${archive}.age`;
    run("age", ["-r", recipient, "-o", encrypted, archive]);
    await rm(archive, { force: true });
    process.stdout.write(`${encrypted}\n`);
    return encrypted;
  } finally {
    compose(directory, ["up", "-d", "app", "scheduler"], { allowFailure: true });
  }
}

async function restore() {
  const archiveArg = positionals[0];
  if (!archiveArg) throw new CliError("restore requires an archive path.", 2);
  if (!force) throw new CliError("restore requires --force after you verify the destination and backup.", 2);
  const archive = path.resolve(archiveArg);
  const directory = path.resolve(positionals[1] ?? ".");
  await readConfig(directory);
  const temp = await mkdtemp(path.join(os.tmpdir(), "harly-restore-"));
  let plaintext = archive;
  if (archive.endsWith(".age")) {
    plaintext = path.join(temp, "backup.tar.gz");
    const identity = process.env.AGE_IDENTITY;
    if (!identity) throw new CliError("AGE_IDENTITY is required to decrypt this backup.");
    run("age", ["-d", "-i", identity, "-o", plaintext, archive]);
  }
  run("tar", ["-xzf", plaintext, "-C", temp]);
  const manifest = JSON.parse(await readFile(path.join(temp, "manifest.json"), "utf8")) as { files: Record<string, string> };
  const dump = await readFile(path.join(temp, "database.dump"));
  if (sha256(dump) !== manifest.files["database.dump"]) throw new CliError("Backup checksum verification failed.");
  compose(directory, ["stop", "app", "scheduler"]);
  try {
    compose(directory, ["exec", "-T", "postgres", "pg_restore", "-U", "harly", "-d", "harly", "--clean", "--if-exists"], { input: dump });
    if (await exists(path.join(temp, "uploads"))) compose(directory, ["cp", `${path.join(temp, "uploads")}/.`, "app:/data/uploads"]);
    compose(directory, ["run", "--rm", "migrate"]);
  } finally {
    compose(directory, ["up", "-d", "app", "scheduler"], { allowFailure: true });
  }
  await doctor(directory);
}

async function upgrade() {
  const directory = path.resolve(positionals[0] ?? ".");
  const config = await readConfig(directory);
  await preflight(config.proxyMode, false);
  if (!yes && !(await confirm(`Back up and upgrade ${config.image}${toVersion ? ` to ${toVersion}` : ""}?`))) throw new CliError("Upgrade cancelled.", 2);
  await backup(directory);
  if (toVersion) {
    if (toVersion === "latest") throw new CliError("latest is not an allowed upgrade target.", 2);
    const envPath = path.join(directory, ".env");
    const current = await readFile(envPath, "utf8");
    const nextImage = `ghcr.io/vytral/harly:${toVersion}`;
    const updated = current
      .replace(/^HARLY_IMAGE=.*$/m, `HARLY_IMAGE=${envLine(nextImage)}`)
      .replace(/^HARLY_VERSION=.*$/m, `HARLY_VERSION=${envLine(toVersion)}`);
    await atomicWrite(envPath, updated, 0o600);
    config.image = nextImage;
    await atomicWrite(path.join(directory, "harly.config.json"), `${JSON.stringify(config, null, 2)}\n`);
  }
  compose(directory, ["pull"]);
  compose(directory, ["run", "--rm", "migrate"]);
  compose(directory, ["up", "-d", "app", "scheduler"]);
  await doctor(directory);
}

async function main() {
  switch (command) {
    case "init": return init();
    case "launch": return launch();
    case "doctor": return doctor();
    case "backup": return backup();
    case "restore": return restore();
    case "upgrade": return upgrade();
    case "help": case "--help": case "-h": usage(); return;
    default: usage(); throw new CliError(`Unknown command: ${command}`, 2);
  }
}

main().catch((error) => {
  const cliError = error instanceof CliError ? error : new CliError(error instanceof Error ? error.message : "Unexpected failure.");
  process.stderr.write(`${cliError.message}\n`);
  process.exitCode = cliError.exitCode;
});
