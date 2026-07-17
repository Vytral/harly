#!/usr/bin/env node

// src/index.ts
import { createHash, randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
var resourceProfiles = {
  compact: {
    app: "1024m",
    appNodeOptions: "--max-old-space-size=640",
    postgres: "384m",
    migrate: "512m",
    scheduler: "192m",
    caddy: "128m",
    cacheMb: 256
  },
  standard: {
    app: "1536m",
    appNodeOptions: "--max-old-space-size=1024",
    postgres: "768m",
    migrate: "768m",
    scheduler: "256m",
    caddy: "256m",
    cacheMb: 512
  },
  performance: {
    app: "3072m",
    appNodeOptions: "--max-old-space-size=2304",
    postgres: "1536m",
    migrate: "1024m",
    scheduler: "512m",
    caddy: "256m",
    cacheMb: 1024
  }
};
function detectResourceProfile() {
  const memoryGb = os.totalmem() / 1024 ** 3;
  if (memoryGb < 3.5) return "compact";
  if (memoryGb < 7.5) return "standard";
  return "performance";
}
var CliError = class extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
  exitCode;
};
var args = process.argv.slice(2);
var command = args.shift() ?? "help";
var flags = new Set(args.filter((arg) => arg.startsWith("--") && !["--to"].includes(arg)));
var positionals = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--to");
var toIndex = args.indexOf("--to");
var toVersion = toIndex >= 0 ? args[toIndex + 1] : void 0;
var force = flags.has("--force");
var yes = flags.has("--yes");
var json = flags.has("--json");
var interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
var cliVersion = "0.1.1";
var logo = `
\u2588\u2588\u2557  \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557     \u2588\u2588\u2557   \u2588\u2588\u2557
\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551     \u255A\u2588\u2588\u2557 \u2588\u2588\u2554\u255D
\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551      \u255A\u2588\u2588\u2588\u2588\u2554\u255D
\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551       \u255A\u2588\u2588\u2554\u255D
\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557   \u2588\u2588\u2551
\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D   \u255A\u2550\u255D`;
function usage() {
  process.stdout.write(`create-harly \u2014 reproducible Harly self-hosting

Commands:
  create-harly init [directory] [--force]
  create-harly launch [directory] [--yes]
  create-harly doctor [directory] [--json]
  create-harly backup [directory] [--allow-plaintext]
  create-harly restore <archive> [directory] --force
  create-harly upgrade [directory] [--to version|edge] [--yes] [--allow-plaintext]
`);
}
function showBrand() {
  process.stdout.write(`${pc.cyan(logo)}

${pc.bold("Self-hosted ATS")} ${pc.dim(`\xB7 v${cliVersion}`)}

`);
}
function unwrapPrompt(value) {
  if (!p.isCancel(value)) return value;
  p.cancel("Installation cancelled.");
  throw new CliError("", 2);
}
function run(program, commandArgs, options = {}) {
  const result = spawnSync(program, commandArgs, {
    cwd: options.cwd,
    input: options.input,
    encoding: options.input ? void 0 : "utf8",
    stdio: options.input ? ["pipe", "pipe", "pipe"] : "pipe",
    maxBuffer: 1024 * 1024 * 512
  });
  if (result.status !== 0 && !options.allowFailure) {
    const message = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new CliError(`${program} ${commandArgs.join(" ")} failed${message ? `: ${message.trim()}` : "."}`);
  }
  return result;
}
function compose(cwd, composeArgs, options = {}) {
  return run("docker", ["compose", ...composeArgs], { cwd, ...options });
}
function parseVersion(value) {
  return (value.match(/\d+(?:\.\d+)+/)?.[0] ?? "0").split(".").map(Number);
}
function atLeast(actual, expected) {
  return expected.every((part, index) => (actual[index] ?? 0) === part ? true : (actual[index] ?? 0) > part ? true : expected.slice(0, index).every((item, i) => item === (actual[i] ?? 0)) ? false : true);
}
async function portAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error) => {
      resolve(error.code === "EACCES");
    });
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
async function freeDiskGb(directory) {
  let current = path.resolve(directory);
  while (!await exists(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const filesystem = await statfs(current);
  return filesystem.bavail * filesystem.bsize / 1024 ** 3;
}
async function preflight(mode, checkPorts = true, requestedPort, directory = process.cwd()) {
  if (!atLeast(parseVersion(process.versions.node), [20, 12, 0])) throw new CliError("Node.js 20.12 or newer is required.");
  const docker = run("docker", ["version", "--format", "{{.Server.Version}}"], { allowFailure: true });
  if (docker.status !== 0 || !atLeast(parseVersion(String(docker.stdout)), [24, 0, 0])) throw new CliError("Docker Engine 24 or newer is required and must be running.");
  const plugin = run("docker", ["compose", "version", "--short"], { allowFailure: true });
  if (plugin.status !== 0 || !atLeast(parseVersion(String(plugin.stdout)), [2, 20, 0])) throw new CliError("Docker Compose 2.20 or newer is required.");
  if (checkPorts) {
    const ports = mode === "caddy" ? [80, 443] : [requestedPort ?? Number(process.env.HARLY_PORT ?? 3e3)];
    for (const port of ports) if (!await portAvailable(port)) throw new CliError(`Port ${port} is already in use.`);
  }
  const diskGb = await freeDiskGb(directory);
  if (diskGb < 5) throw new CliError(`At least 5 GB of free disk is required (${diskGb.toFixed(1)} GB available).`);
  return { cpuCount: os.cpus().length, memoryGb: os.totalmem() / 1024 ** 3, diskGb };
}
function requiredEnvironment(name, value) {
  if (value?.trim()) return value.trim();
  throw new CliError(`${name} is required in non-interactive mode.`, 2);
}
async function confirm2(question) {
  if (yes) return true;
  if (!interactive) return false;
  return unwrapPrompt(await p.confirm({ message: question, initialValue: false }));
}
function progressStep(message, success, action) {
  if (!interactive) {
    action();
    return;
  }
  const step = p.spinner();
  step.start(message);
  try {
    action();
    step.stop(success);
  } catch (error) {
    step.stop(`${message} failed`);
    throw error;
  }
}
function normalizeUrl(value, mode) {
  const candidate = value.includes("://") ? value : `${mode === "local" ? "http" : "https"}://${value}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/") throw new CliError("Public URL must be an HTTP(S) origin without a path.", 2);
  if (mode !== "local" && url.protocol !== "https:") throw new CliError("Caddy and external proxy modes require an HTTPS public URL.", 2);
  return url;
}
function secret() {
  return randomBytes(32).toString("base64url");
}
function envLine(value) {
  return JSON.stringify(value);
}
function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
function validateEmail(value) {
  if (!value || !/^\S+@\S+\.\S+$/.test(value)) return "Enter a valid email address.";
}
function validatePublicOrigin(value) {
  if (!value?.trim()) return "Enter a domain or public URL.";
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    const parsed = new URL(candidate);
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return "Use an origin without a path, query, or hash.";
  } catch {
    return "Enter a valid domain or public URL.";
  }
}
function hostSummary(host) {
  return `${host.cpuCount} CPU \xB7 ${host.memoryGb.toFixed(1)} GB RAM \xB7 ${host.diskGb.toFixed(1)} GB free`;
}
async function collectNonInteractiveAnswers(directory) {
  const mode = process.env.HARLY_PROXY_MODE ?? "caddy";
  if (!["caddy", "external", "local"].includes(mode)) throw new CliError("Invalid proxy mode.", 2);
  const url = normalizeUrl(requiredEnvironment("HARLY_URL", process.env.HARLY_URL), mode);
  const requestedPort = Number(process.env.HARLY_PORT ?? (mode === "local" && url.port ? url.port : 3e3));
  await preflight(mode, true, requestedPort, directory);
  if (mode !== "local") await dns.lookup(url.hostname);
  const email = requiredEnvironment("HARLY_INITIAL_ADMIN_EMAIL", process.env.HARLY_INITIAL_ADMIN_EMAIL).toLowerCase();
  if (validateEmail(email)) throw new CliError("Invalid owner email.", 2);
  const organization = process.env.HARLY_ORGANIZATION?.trim() || "My organization";
  const storage = process.env.STORAGE_PROVIDER ?? "local";
  if (!["local", "s3"].includes(storage)) throw new CliError("Invalid storage provider.", 2);
  const resourceProfile = process.env.HARLY_RESOURCE_PROFILE ?? detectResourceProfile();
  if (!Object.hasOwn(resourceProfiles, resourceProfile)) throw new CliError("Invalid resource profile.", 2);
  const s3 = storage === "s3" ? {
    bucket: requiredEnvironment("S3_BUCKET", process.env.S3_BUCKET),
    region: process.env.S3_REGION?.trim() || "auto",
    accessKeyId: requiredEnvironment("S3_ACCESS_KEY_ID", process.env.S3_ACCESS_KEY_ID),
    secretAccessKey: requiredEnvironment("S3_SECRET_ACCESS_KEY", process.env.S3_SECRET_ACCESS_KEY),
    endpoint: process.env.S3_ENDPOINT?.trim() || "",
    publicUrl: process.env.S3_PUBLIC_URL?.trim() || ""
  } : null;
  const image = process.env.HARLY_IMAGE_REF ?? "ghcr.io/vytral/harly:0.1.0-beta.1";
  if (image.endsWith(":latest")) throw new CliError("Installations must pin a version or digest, never latest.", 2);
  return { mode, url, email, organization, storage, s3, resourceProfile, image };
}
async function collectInteractiveAnswers(directory) {
  showBrand();
  p.intro(pc.bgCyan(pc.black(" Welcome to Harly ")));
  const publicOrigin = unwrapPrompt(await p.text({
    message: "Public domain or URL",
    placeholder: "harly.example.com",
    initialValue: process.env.HARLY_URL,
    validate: validatePublicOrigin
  }));
  const mode = unwrapPrompt(await p.select({
    message: "Reverse proxy",
    initialValue: process.env.HARLY_PROXY_MODE ?? "caddy",
    options: [
      { value: "caddy", label: "Automatic HTTPS with Caddy", hint: "recommended" },
      { value: "external", label: "External Nginx or Traefik" },
      { value: "local", label: "Local HTTP only", hint: "development" }
    ]
  }));
  const url = normalizeUrl(publicOrigin, mode);
  const preflightSpinner = p.spinner();
  preflightSpinner.start("Checking Docker, ports, and DNS");
  let host;
  try {
    const requestedPort = Number(process.env.HARLY_PORT ?? (mode === "local" && url.port ? url.port : 3e3));
    host = await preflight(mode, true, requestedPort, directory);
    if (mode !== "local") await dns.lookup(url.hostname);
    preflightSpinner.stop("Host preflight passed");
  } catch (error) {
    preflightSpinner.stop("Host preflight failed");
    throw error;
  }
  const email = unwrapPrompt(await p.text({
    message: "Initial owner email",
    placeholder: "owner@example.com",
    initialValue: process.env.HARLY_INITIAL_ADMIN_EMAIL,
    validate: validateEmail
  })).toLowerCase();
  const organization = unwrapPrompt(await p.text({
    message: "Organization name",
    placeholder: "Acme Inc.",
    initialValue: process.env.HARLY_ORGANIZATION ?? "My organization",
    validate: (value) => value?.trim() ? void 0 : "Enter an organization name."
  }));
  const storage = unwrapPrompt(await p.select({
    message: "File storage",
    initialValue: process.env.STORAGE_PROVIDER ?? "local",
    options: [
      { value: "local", label: "Local persistent volume", hint: "simple" },
      { value: "s3", label: "S3, R2, or MinIO", hint: "recommended for growth" }
    ]
  }));
  const s3 = storage === "s3" ? {
    bucket: unwrapPrompt(await p.text({ message: "S3 bucket", initialValue: process.env.S3_BUCKET, validate: (value) => value?.trim() ? void 0 : "Enter the bucket name." })),
    region: unwrapPrompt(await p.text({ message: "S3 region", initialValue: process.env.S3_REGION ?? "auto" })),
    accessKeyId: unwrapPrompt(await p.text({ message: "S3 access key ID", initialValue: process.env.S3_ACCESS_KEY_ID, validate: (value) => value?.trim() ? void 0 : "Enter the access key ID." })),
    secretAccessKey: unwrapPrompt(await p.password({ message: "S3 secret access key", mask: "\u2022", validate: (value) => value?.trim() ? void 0 : "Enter the secret access key." })),
    endpoint: unwrapPrompt(await p.text({ message: "S3 endpoint", placeholder: "Leave blank for AWS", initialValue: process.env.S3_ENDPOINT ?? "" })),
    publicUrl: unwrapPrompt(await p.text({ message: "S3 public URL", placeholder: "Optional", initialValue: process.env.S3_PUBLIC_URL ?? "" }))
  } : null;
  const detectedProfile = detectResourceProfile();
  p.note(hostSummary(host), `Detected host \xB7 ${detectedProfile}`);
  const resourceProfile = unwrapPrompt(await p.select({
    message: "Resource profile",
    initialValue: process.env.HARLY_RESOURCE_PROFILE ?? detectedProfile,
    options: [
      { value: "compact", label: "Compact", hint: "2 GB RAM + swap" },
      { value: "standard", label: "Standard", hint: "4 GB RAM, recommended" },
      { value: "performance", label: "Performance", hint: "8 GB RAM or more" }
    ]
  }));
  const image = process.env.HARLY_IMAGE_REF ?? "ghcr.io/vytral/harly:0.1.0-beta.1";
  if (image.endsWith(":latest")) throw new CliError("Installations must pin a version or digest, never latest.", 2);
  const services = `PostgreSQL, migrator, app, scheduler${mode === "caddy" ? ", Caddy" : ""}`;
  const localPort = process.env.HARLY_PORT ?? (mode === "local" && url.port ? url.port : "3000");
  p.note([
    `Directory   ${directory}`,
    `URL         ${url.origin}`,
    `Image       ${image}`,
    `Services    ${services}`,
    `Ports       ${mode === "caddy" ? "80, 443" : `127.0.0.1:${localPort}`}`,
    `Storage     ${storage === "local" ? "Local persistent volume" : "S3-compatible"}`,
    `Resources   ${resourceProfile}`,
    `HTTPS       ${mode === "caddy" ? "Managed automatically by Caddy" : mode === "external" ? "Managed by external proxy" : "Disabled"}`
  ].join("\n"), "Installation plan");
  const approved = unwrapPrompt(await p.confirm({ message: "Generate this installation?", initialValue: true }));
  if (!approved) {
    p.cancel("No files were changed.");
    throw new CliError("", 2);
  }
  return { mode, url, email, organization, storage, s3, resourceProfile, image };
}
async function atomicWrite(file, contents, mode) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  await writeFile(temp, contents, { mode });
  await rename(temp, file);
  if (mode) await chmod(file, mode);
}
async function exists(file) {
  return stat(file).then(() => true, () => false);
}
var composeTemplate = `name: harly
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
var envExample = `HARLY_IMAGE=ghcr.io/vytral/harly:<version-or-digest>
HARLY_VERSION=<version>
HARLY_URL=https://harly.example.com
HARLY_PORT=3000
HARLY_DOMAIN=harly.example.com
COMPOSE_PROFILES=proxy
POSTGRES_USER=harly
POSTGRES_PASSWORD=<secret>
POSTGRES_DB=harly
BETTER_AUTH_SECRET=<secret>
AI_ENCRYPTION_KEY=<secret>
STORAGE_UPLOAD_SECRET=<secret>
CRON_SECRET=<secret>
HARLY_SETUP_SECRET=<secret>
HARLY_INITIAL_ADMIN_EMAIL=owner@example.com
STORAGE_PROVIDER=local
RESEND_API_KEY=
EMAIL_FROM=
# Optional resource tuning (defaults target a 4 GB VPS)
HARLY_APP_MEMORY=1536m
HARLY_POSTGRES_MEMORY=768m
HARLY_SCHEDULER_MEMORY=256m
HARLY_CADDY_MEMORY=256m
HARLY_CACHE_MAX_MB=512
HARLY_CACHE_MAX_AGE_DAYS=7
HARLY_LOG_MAX_SIZE=10m
HARLY_LOG_MAX_FILES=3
`;
async function init() {
  const directory = path.resolve(positionals[0] ?? "harly");
  const answers = interactive ? await collectInteractiveAnswers(directory) : await collectNonInteractiveAnswers(directory);
  const { mode, url, email, organization, storage, s3, resourceProfile, image } = answers;
  const resources = resourceProfiles[resourceProfile];
  const generationSpinner = interactive ? p.spinner() : null;
  generationSpinner?.start("Generating secure configuration");
  try {
    await mkdir(directory, { recursive: true });
    const envPath = path.join(directory, ".env");
    if (!await exists(envPath)) {
      const env = [
        `HARLY_IMAGE=${envLine(image)}`,
        `HARLY_VERSION=${envLine(image.includes("@sha256:") ? "digest" : image.split(":").at(-1) ?? "unknown")}`,
        `HARLY_URL=${envLine(url.origin)}`,
        `HARLY_PORT=${envLine(process.env.HARLY_PORT ?? (mode === "local" && url.port ? url.port : "3000"))}`,
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
        ...s3 ? [
          `S3_BUCKET=${envLine(s3.bucket)}`,
          `S3_REGION=${envLine(s3.region)}`,
          `S3_ACCESS_KEY_ID=${envLine(s3.accessKeyId)}`,
          `S3_SECRET_ACCESS_KEY=${envLine(s3.secretAccessKey)}`,
          `S3_ENDPOINT=${envLine(s3.endpoint)}`,
          `S3_PUBLIC_URL=${envLine(s3.publicUrl)}`
        ] : [],
        "RESEND_API_KEY=",
        "EMAIL_FROM=",
        `HARLY_APP_MEMORY=${resources.app}`,
        `HARLY_APP_NODE_OPTIONS=${resources.appNodeOptions}`,
        `HARLY_POSTGRES_MEMORY=${resources.postgres}`,
        `HARLY_MIGRATE_MEMORY=${resources.migrate}`,
        `HARLY_SCHEDULER_MEMORY=${resources.scheduler}`,
        `HARLY_CADDY_MEMORY=${resources.caddy}`,
        `HARLY_CACHE_MAX_MB=${resources.cacheMb}`,
        "HARLY_CACHE_MAX_AGE_DAYS=7",
        "HARLY_LOG_MAX_SIZE=10m",
        "HARLY_LOG_MAX_FILES=3",
        ""
      ].join("\n");
      await atomicWrite(envPath, env, 384);
    }
    const config = { version: 1, proxyMode: mode, publicUrl: url.origin, image, organizationName: organization, initialAdminEmail: email, storage, resourceProfile };
    const templates = [
      ["compose.yaml", composeTemplate],
      ["Caddyfile", "{$HARLY_DOMAIN} {\n  encode zstd gzip\n  reverse_proxy app:3000\n}\n"],
      [".env.example", envExample],
      [".gitignore", ".env\nbackups/\n"],
      ["harly.config.json", `${JSON.stringify(config, null, 2)}
`],
      ["README.md", `# Harly self-host

- Start: \`docker compose up -d\`
- Diagnose: \`npx @harly/create doctor .\`
- Backup before every upgrade.
- Complete the first owner at ${url.origin}/setup using HARLY_SETUP_SECRET from .env.
`]
    ];
    for (const [name, contents, modeBits] of templates) {
      const target = path.join(directory, name);
      if (!await exists(target) || force) await atomicWrite(target, contents, modeBits);
    }
  } catch (error) {
    generationSpinner?.stop("Configuration generation failed");
    throw error;
  }
  generationSpinner?.stop("Configuration generated");
  if (interactive) {
    p.log.success(`${pc.bold(directory)} is ready`);
    const launchNow = unwrapPrompt(await p.confirm({
      message: "Pull the image and launch Harly now?",
      initialValue: false
    }));
    if (launchNow) {
      await launch(directory, true);
      p.outro(`Harly is ready at ${pc.cyan(url.origin)} \xB7 run ${pc.cyan("npx @harly/create doctor .")}`);
    } else {
      p.outro(`Next: ${pc.cyan(`cd ${shellQuote(directory)} && npx @harly/create launch . --yes`)}`);
    }
  } else {
    process.stdout.write(`
Generated ${directory}
Image: ${image}
Mode: ${mode}
Resource profile: ${resourceProfile}
Services: postgres, migrate, app, scheduler${mode === "caddy" ? ", caddy" : ""}
Volumes: postgres-data, uploads, next-cache${mode === "caddy" ? ", caddy-data, caddy-config" : ""}

`);
  }
}
async function readConfig(directory) {
  try {
    return JSON.parse(await readFile(path.join(directory, "harly.config.json"), "utf8"));
  } catch {
    throw new CliError("harly.config.json is missing or invalid. Run init first.");
  }
}
async function launch(explicitDirectory, confirmed = false) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  if (interactive && !confirmed) {
    showBrand();
    p.intro(pc.bgCyan(pc.black(" Launch Harly ")));
    p.note(`Image  ${config.image}
Mode   ${config.proxyMode}
URL    ${config.publicUrl}`, "Launch plan");
  } else if (!interactive) {
    process.stdout.write(`Image: ${config.image}
Mode: ${config.proxyMode}
Commands: docker compose pull; docker compose up -d --wait
`);
  }
  if (!confirmed && !yes && !await confirm2("Continue?")) {
    if (!process.stdin.isTTY) throw new CliError("--yes is required in non-interactive mode.", 2);
    throw new CliError("Launch cancelled.", 2);
  }
  progressStep("Validating Docker Compose", "Compose configuration is valid", () => compose(directory, ["config", "--quiet"]));
  progressStep("Pulling immutable container images", "Container images downloaded", () => compose(directory, ["pull"]));
  progressStep("Starting Harly and waiting for healthchecks", "Harly services are healthy", () => {
    compose(directory, ["up", "-d", "--wait", "--wait-timeout", "180"]);
  });
  if (interactive && !confirmed) {
    p.outro(`Harly is ready at ${pc.cyan(config.publicUrl)} \xB7 run ${pc.cyan("npx @harly/create doctor .")}`);
  } else if (!interactive) {
    process.stdout.write(`Harly is ready at ${config.publicUrl}. Run doctor to verify the public route.
`);
  }
}
async function doctor(explicitDirectory, print = true) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  const checks = [];
  const valid = compose(directory, ["config", "--quiet"], { allowFailure: true });
  checks.push({ name: "compose", ok: valid.status === 0 });
  const servicesResult = compose(directory, ["ps", "--status", "running", "--services"], { allowFailure: true });
  const services = String(servicesResult.stdout ?? "").trim().split(/\s+/).filter(Boolean);
  for (const name of ["postgres", "app", "scheduler", ...config.proxyMode === "caddy" ? ["caddy"] : []]) checks.push({ name: `service:${name}`, ok: services.includes(name) });
  checks.push({ name: "profile:caddy", ok: config.proxyMode === "caddy" ? services.includes("caddy") : !services.includes("caddy") });
  try {
    const response = await fetch(`${config.publicUrl}/api/health/ready`, { signal: AbortSignal.timeout(5e3) });
    checks.push({ name: "readiness", ok: response.ok, detail: `HTTP ${response.status}` });
  } catch {
    checks.push({ name: "readiness", ok: false, detail: "unreachable" });
  }
  const result = { ok: checks.every((check) => check.ok), proxyMode: config.proxyMode, image: config.image, checks };
  if (print) process.stdout.write(json ? `${JSON.stringify(result)}
` : `${checks.map((check) => `${check.ok ? "\u2713" : "\u2717"} ${check.name}${check.detail ? ` \u2014 ${check.detail}` : ""}`).join("\n")}
`);
  if (!result.ok && print) process.exitCode = 1;
  return result;
}
function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
async function backup(explicitDirectory, automaticPlaintext = false) {
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
    const manifest = { version: config.image, createdAt: (/* @__PURE__ */ new Date()).toISOString(), files: { "database.dump": sha256(bytes) } };
    await writeFile(path.join(temp, "manifest.json"), `${JSON.stringify(manifest, null, 2)}
`);
    const archive = path.join(outputDirectory, `harly-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.tar.gz`);
    run("tar", ["-czf", archive, "-C", temp, "."]);
    await chmod(archive, 384);
    if (flags.has("--allow-plaintext") || automaticPlaintext && !process.env.AGE_RECIPIENT) {
      if (automaticPlaintext && !flags.has("--allow-plaintext")) process.stderr.write("No AGE_RECIPIENT configured; created a local backup protected with mode 0600.\n");
      process.stdout.write(`${archive}
`);
      return archive;
    }
    const recipient = process.env.AGE_RECIPIENT;
    if (!recipient) throw new CliError("AGE_RECIPIENT is required unless --allow-plaintext is explicitly set.");
    const encrypted = `${archive}.age`;
    run("age", ["-r", recipient, "-o", encrypted, archive]);
    await chmod(encrypted, 384);
    await rm(archive, { force: true });
    process.stdout.write(`${encrypted}
`);
    return encrypted;
  } finally {
    compose(directory, ["up", "-d", "app", "scheduler"], { allowFailure: true });
    await rm(temp, { recursive: true, force: true });
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
  const manifest = JSON.parse(await readFile(path.join(temp, "manifest.json"), "utf8"));
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
  if (toVersion === "latest") throw new CliError("latest is not allowed. Use edge for previews or a fixed version.", 2);
  const requestedImage = toVersion ? toVersion.startsWith("ghcr.io/") ? toVersion : `ghcr.io/vytral/harly:${toVersion}` : config.requestedImage ?? config.image;
  if (!yes && !await confirm2(`Back up and upgrade ${config.image} to ${requestedImage}?`)) {
    if (!interactive) throw new CliError("--yes is required in non-interactive mode.", 2);
    throw new CliError("Upgrade cancelled.", 2);
  }
  if (interactive) {
    showBrand();
    p.intro(pc.bgCyan(pc.black(" Upgrade Harly ")));
    p.note(`Current  ${config.image}
Target   ${requestedImage}
Data     preserved`, "Upgrade plan");
  }
  await backup(directory, true);
  const envPath = path.join(directory, ".env");
  const configPath = path.join(directory, "harly.config.json");
  const originalEnv = await readFile(envPath, "utf8");
  const setImage = (contents, image, version) => contents.replace(/^HARLY_IMAGE=.*$/m, `HARLY_IMAGE=${envLine(image)}`).replace(/^HARLY_VERSION=.*$/m, `HARLY_VERSION=${envLine(version)}`);
  await atomicWrite(envPath, setImage(originalEnv, requestedImage, toVersion ?? "current"), 384);
  try {
    progressStep("Pulling the requested image", "Image downloaded", () => compose(directory, ["pull", "app", "migrate", "scheduler"]));
  } catch (error) {
    await atomicWrite(envPath, originalEnv, 384);
    throw error;
  }
  const inspected = run("docker", ["image", "inspect", requestedImage, "--format", '{{join .RepoDigests "\\n"}}'], { allowFailure: true });
  const repository = requestedImage.split("@")[0].replace(/:[^/:]+$/, "");
  const digest = String(inspected.stdout ?? "").split(/\s+/).find((value) => value.startsWith(`${repository}@sha256:`));
  const deployedImage = digest ?? requestedImage;
  const deployedVersion = deployedImage.includes("@sha256:") ? deployedImage.split("@sha256:")[1].slice(0, 12) : toVersion ?? "current";
  await atomicWrite(envPath, setImage(await readFile(envPath, "utf8"), deployedImage, deployedVersion), 384);
  config.requestedImage = requestedImage;
  config.image = deployedImage;
  config.deployedAt = (/* @__PURE__ */ new Date()).toISOString();
  await atomicWrite(configPath, `${JSON.stringify(config, null, 2)}
`);
  progressStep("Applying database migrations", "Migrations applied", () => compose(directory, ["run", "--rm", "migrate"]));
  progressStep("Recreating services and waiting for healthchecks", "Services are healthy", () => {
    compose(directory, ["up", "-d", "--wait", "--wait-timeout", "180"]);
  });
  let result = await doctor(directory, false);
  for (let attempt = 0; !result.ok && attempt < 15; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    result = await doctor(directory, false);
  }
  if (result.ok) await doctor(directory);
  if (!result.ok) throw new CliError("Upgrade completed but health checks failed. Run `npx harly doctor .` for details.");
  if (interactive) p.outro(`Harly is running ${pc.cyan(deployedImage)} at ${pc.cyan(config.publicUrl)}`);
}
async function main() {
  switch (command) {
    case "init":
      return init();
    case "launch":
      return launch();
    case "doctor":
      return doctor();
    case "backup":
      return backup();
    case "restore":
      return restore();
    case "upgrade":
      return upgrade();
    case "help":
    case "--help":
    case "-h":
      usage();
      return;
    default:
      usage();
      throw new CliError(`Unknown command: ${command}`, 2);
  }
}
main().catch((error) => {
  const cliError = error instanceof CliError ? error : new CliError(error instanceof Error ? error.message : "Unexpected failure.");
  if (cliError.message) process.stderr.write(`${cliError.message}
`);
  process.exitCode = cliError.exitCode;
});
