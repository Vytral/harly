#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createServer, isIP } from "node:net";
import { createSocket } from "node:dgram";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  CliError,
  DockerMissing,
  DnsFailure,
  InsufficientDisk,
  PortConflict,
  RetryWithOptions,
  detectPortOwner,
  handleHarlyError,
  type PortDetail,
  type RenderContext,
} from "./errors.js";
import { embeddedRelease, releaseImage, type HarlyRelease } from "./release.js";
import { pullWithProgress } from "./pull.js";
import { atLeast, compose, parseVersion, run } from "./shell.js";
import {
  accent,
  humanBytes,
  icon,
  ink,
  rows,
  showBrand,
  soft,
  spinnerStyle,
} from "./theme.js";
import { describeImage, envVersion, shortDigest, versionLine } from "./version.js";
import { hasOption, option, parseCliArgs, type ParsedCli } from "./cli.js";
import {
  emitJson,
  errorCodeFor,
  resultError,
  resultOk,
  type CliResult,
} from "./result.js";

type ProxyMode = "caddy" | "external" | "local";
type ResourceProfile = "compact" | "standard" | "performance";
type HarlyFileConfig = {
  version: 1;
  proxyMode: ProxyMode;
  publicUrl: string;
  image: string;
  organizationName: string;
  initialAdminEmail: string;
  storage: "local" | "s3";
  resourceProfile: ResourceProfile;
  deployedAt?: string;
  requestedImage?: string;
};

const resourceProfiles: Record<
  ResourceProfile,
  {
    app: string;
    appNodeOptions: string;
    postgres: string;
    migrate: string;
    scheduler: string;
    caddy: string;
    cacheMb: number;
  }
> = {
  compact: {
    app: "1024m",
    appNodeOptions: "--max-old-space-size=640",
    postgres: "384m",
    migrate: "512m",
    scheduler: "192m",
    caddy: "128m",
    cacheMb: 256,
  },
  standard: {
    app: "1536m",
    appNodeOptions: "--max-old-space-size=1024",
    postgres: "768m",
    migrate: "768m",
    scheduler: "256m",
    caddy: "256m",
    cacheMb: 512,
  },
  performance: {
    app: "3072m",
    appNodeOptions: "--max-old-space-size=2304",
    postgres: "1536m",
    migrate: "1024m",
    scheduler: "512m",
    caddy: "256m",
    cacheMb: 1024,
  },
};

function detectResourceProfile(): ResourceProfile {
  // Profile the host by free memory minus Harly's known reservations, not by
  // total RAM. A 4 GB VPS that already runs Postgres and Redis for another
  // service is not a "standard" candidate; Harly would OOM under load.
  const reservationsGb = 1.5; // postgres 768m + scheduler 256m + caddy 256m + headroom
  const freeGb = os.freemem() / 1024 ** 3 - reservationsGb;
  if (freeGb < 1.5) return "compact";
  if (freeGb < 3.5) return "standard";
  return "performance";
}

let parsed: ParsedCli;
let parseError: unknown;
try {
  parsed = parseCliArgs(process.argv.slice(2));
} catch (error) {
  parseError = error;
  parsed = {
    command: "help",
    positionals: [],
    flags: process.argv.includes("--json") ? new Set(["--json"]) : new Set(),
    values: new Map(),
    raw: process.argv.slice(2),
  };
}
const command = parsed.flags.has("--version")
  ? "--version"
  : parsed.flags.has("--help")
    ? "--help"
    : parsed.command;
const flags = parsed.flags;
const positionals = parsed.positionals;
const toVersion = option(parsed, "--to");
const force = flags.has("--force");
const yes = flags.has("--yes");
const json = flags.has("--json");
const verbose = flags.has("--verbose");
// CI and automated recovery checks must never wait for a terminal prompt,
// even when their runner allocates a pseudo-TTY.
const interactive = Boolean(
  !json && !flags.has("--non-interactive") && process.stdin.isTTY && process.stdout.isTTY && !process.env.CI,
);
const cliVersion = "0.4.0";
let jsonResultWritten = false;

function humanOut(message: string): void {
  if (json) process.stderr.write(message);
  else process.stdout.write(message);
}

function writeResult(result: CliResult): void {
  if (!json || jsonResultWritten) return;
  jsonResultWritten = true;
  emitJson(result);
}

function stableErrorCode(error: unknown): "INVALID_ARGUMENT" | "MISSING_ARGUMENT" | "MISSING_SECRET" | "INVALID_SECRET_SOURCE" | "INVALID_CONFIGURATION" | "UNSUPPORTED_PROVIDER" | "PREFLIGHT_FAILED" | "REMOTE_OPERATION_FAILED" | "READINESS_TIMEOUT" | "PARTIAL_PROVISIONING" | "CANCELLED" | "INTERNAL_ERROR" {
  if (railwayResources.length > 0 && command === "deploy") return "PARTIAL_PROVISIONING";
  if (error instanceof Error && error.name === "CliUsageError") return "INVALID_ARGUMENT";
  const explicit = errorCodeFor(error);
  if (explicit !== "INTERNAL_ERROR") return explicit;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("required") || message.includes("missing")) return "MISSING_ARGUMENT";
  if (message.includes("readiness") || message.includes("timed out")) return "READINESS_TIMEOUT";
  if (message.includes("railway") || message.includes("api")) return "REMOTE_OPERATION_FAILED";
  return "INTERNAL_ERROR";
}

function usageError(message: string, code = "INVALID_ARGUMENT"): CliError {
  return new CliError(message, 2, code);
}

function requiredFlagOrEnv(
  flagName: string,
  envName: string,
  message = `${flagName} or ${envName} is required.`,
): string {
  const value = option(parsed, flagName) ?? process.env[envName];
  if (!value?.trim()) throw usageError(message, "MISSING_ARGUMENT");
  return value.trim();
}

function readExplicitSecretStdin(flag: string, envName: string): string | undefined {
  if (!hasOption(parsed, flag)) return process.env[envName]?.trim() || undefined;
  if (process.stdin.isTTY) throw usageError(`${flag} requires piped stdin.`, "INVALID_SECRET_SOURCE");
  const data = readFileSync(0, "utf8");
  if (!data.trim()) throw usageError(`${envName} received through stdin is empty.`, "MISSING_SECRET");
  return data.trim();
}
const releaseManifestUrl =
  process.env.HARLY_RELEASE_MANIFEST_URL ??
  "https://raw.githubusercontent.com/Vytral/harly/main/release-manifest.json";
let currentOfficialRelease: HarlyRelease | undefined;
let releaseManifestChecked = false;
const railwayResources: Array<{ type: string; id: string; name: string }> = [];

function recordRailwayResource(type: string, id: string, name: string): void {
  railwayResources.push({ type, id, name });
}

async function promptOrValue(
  message: string,
  flag: string,
  envName: string,
  initialValue?: string,
): Promise<string> {
  if (!interactive) {
    const value = option(parsed, flag) ?? process.env[envName] ?? initialValue;
    if (!value?.trim()) throw usageError(`${flag} or ${envName} is required in non-interactive mode.`, "MISSING_ARGUMENT");
    return value.trim();
  }
  return unwrapPrompt(await p.text({ message, initialValue }));
}

async function promptOrSecret(
  message: string,
  flag: string,
  envName: string,
  stdinFlag: string,
): Promise<string> {
  if (!interactive) {
    const stdinValue = readExplicitSecretStdin(stdinFlag, envName);
    const value = stdinValue ?? process.env[envName];
    if (!value?.trim()) throw usageError(`${envName} is required in non-interactive mode.`, "MISSING_SECRET");
    return value.trim();
  }
  if (process.env[envName]?.trim()) return process.env[envName]!.trim();
  return unwrapPrompt(await p.password({ message, validate: (value) => value?.trim() ? undefined : "Required." }));
}

function validRelease(value: unknown): value is HarlyRelease {
  if (!value || typeof value !== "object") return false;
  const release = value as Partial<HarlyRelease>;
  return (
    typeof release.version === "string" &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      release.version,
    ) &&
    release.image === "ghcr.io/vytral/harly" &&
    typeof release.digest === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(release.digest)
  );
}

async function officialRelease(): Promise<HarlyRelease> {
  if (releaseManifestChecked) return currentOfficialRelease ?? embeddedRelease;
  releaseManifestChecked = true;
  try {
    const response = await fetch(releaseManifestUrl, {
      signal: AbortSignal.timeout(2_000),
    });
    const candidate: unknown = response.ok ? await response.json() : null;
    if (validRelease(candidate)) currentOfficialRelease = candidate;
  } catch {
    // An offline or private source repository must not make a local install
    // impossible. The CLI still has the last verified release embedded in it.
  }
  return currentOfficialRelease ?? embeddedRelease;
}

const commandHelp: Array<[string, string]> = [
  ["harly", "Guided menu — install, or manage a detected installation"],
  ["harly check [directory]", "Verify host requirements without installing"],
  ["harly init [directory] [--force] [--dry-run]", "Generate a new installation"],
  ["harly launch [directory] [--yes]", "Pull images and start the services"],
  ["harly doctor [directory] [--json] [--fix]", "Check services and public readiness"],
  ["harly setup-secret [directory]", "Print HARLY_SETUP_SECRET from .env"],
  ["harly backup [directory] [--encrypt]", "Write a private rollback archive"],
  ["harly restore <archive> [directory] --force", "Restore from an archive"],
  ["harly update [directory] [--to version]", "Back up, upgrade, and migrate"],
  ["harly uninstall [directory] [--remove-data]", "Stop and remove Harly"],
  ["harly deploy <railway|fly|digitalocean>", "Generate a cloud-platform config"],
];

function usage() {
  const width = Math.max(...commandHelp.map(([command]) => command.length));
  process.stdout.write(
    `\n  ${ink("Harly")} ${soft("· self-hosted ATS")}\n\n${commandHelp
      .map(
        ([command, description]) =>
          `  ${accent(command.padEnd(width))}  ${soft(description)}`,
      )
      .join("\n")}\n\n  ${soft(`Run ${ink("npx @harly/cli")} with no arguments for the guided experience.`)}\n\n`,
  );
}

function unwrapPrompt<T>(value: T | symbol): T {
  if (!p.isCancel(value)) return value;
  p.cancel("Installation cancelled.");
  throw new CliError("Operation cancelled.", 2, "CANCELLED");
}

async function portAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      // Docker can publish privileged ports even when this unprivileged Node
      // process cannot bind them directly. EADDRINUSE is the conflict signal.
      // A restricted runner may deny bind() with EACCES/EPERM even when the
      // port is free. Docker performs the real publish check during startup.
      resolve(error.code === "EACCES" || error.code === "EPERM");
    });
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function udpPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.close();
      resolve(error.code !== "EADDRINUSE");
    });
    socket.bind(port, "127.0.0.1", () => socket.close(() => resolve(true)));
  });
}

function portOwner(port: number, protocol: "tcp" | "udp" = "tcp") {
  const commands: Array<[string, string[]]> =
    protocol === "udp"
      ? [
          ["ss", ["-H", "-lunp", `sport = :${port}`]],
          ["lsof", ["-nP", `-iUDP:${port}`]],
        ]
      : [
          ["ss", ["-H", "-ltnp", `sport = :${port}`]],
          ["lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]],
        ];
  for (const [program, args] of commands) {
    const result = run(program, args, { allowFailure: true });
    const output = String(result.stdout ?? "").trim();
    if (result.status === 0 && output) return output.split("\n")[0].trim();
  }
  return undefined;
}

async function checkRequiredPorts(
  mode: ProxyMode,
  requestedPort?: number,
  ctx: RenderContext = { interactive, yes },
): Promise<number | undefined> {
  const port =
    requestedPort ?? Number(process.env.HARLY_PORT ?? 3000);
  const checks: PortDetail[] =
    mode === "caddy"
      ? [
          { port: 80, protocol: "tcp" },
          { port: 443, protocol: "tcp" },
          { port: 443, protocol: "udp" },
        ]
      : [{ port, protocol: "tcp" }];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const occupied: PortDetail[] = [];
    for (const check of checks) {
      const available =
        check.protocol === "udp"
          ? await udpPortAvailable(check.port)
          : await portAvailable(check.port);
      if (!available) {
        const raw = portOwner(check.port, check.protocol);
        const owner = detectPortOwner(check.port, check.protocol);
        // Fall back to the raw line if classification lost the detail.
        if (owner.kind === "unknown" && raw) {
          occupied.push({ ...check });
        } else {
          occupied.push({ ...check, owner });
        }
      }
    }
    if (occupied.length === 0) return port;

    const result = await handleHarlyError(
      new PortConflict(occupied, mode, port),
      ctx,
    );
    if (result.kind === "recovered") continue;
    if (result.kind === "switch-mode") throw new RetryWithOptions(result.mode);
    if (result.kind === "change-port") {
      throw new RetryWithOptions(undefined, result.port);
    }
    throw new CliError("", result.exitCode);
  }
  throw new CliError(
    `Could not free the required ports after 3 attempts: ${checks.map((c) => `${c.protocol.toUpperCase()} ${c.port}`).join(", ")}.`,
    1,
  );
}

async function freeDiskGb(directory: string): Promise<number> {
  let current = path.resolve(directory);
  while (!(await exists(current))) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const filesystem = await statfs(current);
  return (filesystem.bavail * filesystem.bsize) / 1024 ** 3;
}

type FirewallWarning = {
  source: "ufw" | "iptables";
  detail: string;
  fix: string;
};

/** Detect a local firewall that would block Caddy's public ports. This is a
 * warning, never an error: cloud security groups, transparent proxies, and
 * VPS providers without OS-level firewalls are all valid configurations. */
function detectFirewallWarning(): FirewallWarning | null {
  const ufw = run("ufw", ["status"], { allowFailure: true });
  if (ufw.status === 0) {
    const out = String(ufw.stdout ?? "");
    if (/Status:\s*active/i.test(out)) {
      const allows80 = /(^|\s)80\/tcp\s+ALLOW/i.test(out);
      const allows443 = /(^|\s)443\/tcp\s+ALLOW/i.test(out);
      if (!allows80 || !allows443) {
        return {
          source: "ufw",
          detail: `ufw is active but ports 80/443 are not allowed`,
          fix: "ufw allow 80/tcp && ufw allow 443/tcp",
        };
      }
    }
  }
  // iptables check: a non-empty INPUT chain with a REJECT policy is a
  // common default on DigitalOcean / Hetzner. Skip — too noisy to verify
  // whether a specific rule allows the port. The ufw path covers most cases.
  return null;
}

async function readDockerInfo() {
  const docker = run("docker", ["version", "--format", "{{.Server.Version}}"], {
    allowFailure: true,
  });
  if (docker.status !== 0) {
    const stderr = String(docker.stderr ?? "").trim();
    throw new DockerMissing(
      stderr.includes("Cannot connect to the Docker daemon") ||
        stderr.includes("Is the docker daemon running")
        ? "not-running"
        : "not-installed",
      stderr || "Docker Engine 24 or newer is required and must be running.",
    );
  }
  if (!atLeast(parseVersion(String(docker.stdout)), [24, 0, 0]))
    throw new DockerMissing(
      "engine-too-old",
      `Docker Engine 24 or newer is required (found ${String(docker.stdout).trim()}).`,
    );
  const plugin = run("docker", ["compose", "version", "--short"], {
    allowFailure: true,
  });
  if (
    plugin.status !== 0 ||
    !atLeast(parseVersion(String(plugin.stdout)), [2, 20, 0])
  )
    throw new DockerMissing(
      "compose-too-old",
      `Docker Compose 2.20 or newer is required (found ${String(plugin.stdout).trim() || "missing"}).`,
    );
  return {
    engine: String(docker.stdout).trim(),
    compose: String(plugin.stdout).trim(),
  };
}

async function readDistro(): Promise<string> {
  if (os.platform() === "darwin") return `macOS ${os.release()}`;
  if (os.platform() === "win32") return `Windows ${os.release()}`;
  try {
    const raw = await readFile("/etc/os-release", "utf8");
    const name = raw.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1];
    if (name) return `${name} (kernel ${os.release()})`;
  } catch {
    // not Linux, or no /etc/os-release
  }
  return `${os.platform()} ${os.release()}`;
}

export type HostSummary = {
  distro: string;
  cpuCount: number;
  memoryGb: number;
  freeMemoryGb: number;
  diskGb: number;
  docker?: { engine: string; compose: string };
  firewall?: FirewallWarning;
};

/** Lightweight host-only preflight. Does not check ports or DNS — those need a
 * known proxy mode and domain. Used by `harly check` and as the first half of
 * the full `preflight()`. */
async function preflightHost(directory: string): Promise<HostSummary> {
  if (!atLeast(parseVersion(process.versions.node), [20, 12, 0]))
    throw new DockerMissing(
      "not-installed",
      `Node.js 20.12 or newer is required (running ${process.versions.node}).`,
    );
  const docker = await readDockerInfo().catch((error: unknown) => {
    if (error instanceof DockerMissing) throw error;
    throw new DockerMissing(
      "not-installed",
      error instanceof Error ? error.message : "Docker check failed.",
    );
  });
  const diskGb = await freeDiskGb(directory);
  // HARLY_REQUIRED_DISK_GB lets operators and CI override the default 5 GB
  // floor (small VPS, low-disk test runners, etc.). The CLI still surfaces
  // the actual free space in the check output.
  const requiredDiskGb = Number(process.env.HARLY_REQUIRED_DISK_GB ?? 5);
  if (diskGb < requiredDiskGb)
    throw new InsufficientDisk(requiredDiskGb, diskGb, directory);
  return {
    distro: await readDistro(),
    cpuCount: os.cpus().length,
    memoryGb: os.totalmem() / 1024 ** 3,
    freeMemoryGb: os.freemem() / 1024 ** 3,
    diskGb,
    docker,
    firewall: detectFirewallWarning() ?? undefined,
  };
}

async function preflight(
  mode?: ProxyMode,
  checkPorts = true,
  requestedPort?: number,
  directory = process.cwd(),
  ctx: RenderContext = { interactive, yes },
): Promise<HostSummary> {
  const host = await preflightHost(directory);
  if (checkPorts) await checkRequiredPorts(mode ?? "caddy", requestedPort, ctx);
  return host;
}

function requiredEnvironment(name: string, value?: string): string {
  if (value?.trim()) return value.trim();
  throw new CliError(`${name} is required in non-interactive mode.`, 2, "MISSING_ARGUMENT");
}

async function confirm(question: string): Promise<boolean> {
  if (yes) return true;
  if (!interactive) return false;
  return unwrapPrompt(
    await p.confirm({ message: question, initialValue: false }),
  );
}

function progressStep(message: string, success: string, action: () => void) {
  if (!interactive) {
    action();
    return;
  }
  const step = p.spinner(spinnerStyle);
  step.start(message);
  try {
    action();
    step.stop(success);
  } catch (error) {
    step.stop(`${message} failed`);
    throw error;
  }
}

function normalizeUrl(value: string, mode: ProxyMode): URL {
  const candidate = value.includes("://")
    ? value
    : `${mode === "local" ? "http" : "https"}://${value}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/")
    throw new CliError(
      "Public URL must be an HTTP(S) origin without a path.",
      2,
    );
  if (mode !== "local" && url.protocol !== "https:")
    throw new CliError(
      "Caddy and external proxy modes require an HTTPS public URL.",
      2,
    );
  if (mode !== "local" && (isIP(url.hostname) || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)))
    throw new CliError(
      "Use a real domain or subdomain for HTTPS (for example careers.example.com), not a VPS IP or localhost.",
      2,
    );
  return url;
}

async function verifyPublicDns(
  url: URL,
  ctx: RenderContext = { interactive, yes },
): Promise<string[]> {
  const error = new DnsFailure(url.hostname);
  const initial = await error.attemptResolve();
  if (initial) return initial;
  const result = await error.recover(ctx);
  if (result.kind === "recovered") {
    const resolved = await error.attemptResolve();
    if (resolved) return resolved;
  }
  const exitCode = result.kind === "abort" ? result.exitCode : 1;
  await error.render(ctx);
  throw new CliError("", exitCode);
}

function validateDatabaseUrl(value?: string): string | undefined {
  if (!value?.trim())
    return "A DigitalOcean Managed PostgreSQL connection URL is required.";
  try {
    const url = new URL(value.trim());
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname ||
      url.pathname === "/"
    ) {
      return "Enter a postgresql:// connection URL that includes a database name.";
    }
  } catch {
    return "Enter a valid postgresql:// connection URL.";
  }
  return undefined;
}

function operationTimeoutMs(): number {
  const value = Number(option(parsed, "--timeout") ?? process.env.HARLY_CLI_TIMEOUT ?? 120);
  if (!Number.isFinite(value) || value < 1 || value > 3600)
    throw usageError("--timeout must be between 1 and 3600 seconds.");
  return value * 1000;
}

async function waitForPublicReadiness(origin: string): Promise<void> {
  const timeoutMs = operationTimeoutMs();
  const started = Date.now();
  let lastDetail = "unreachable";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${origin}/api/health/ready`, {
        signal: AbortSignal.timeout(Math.min(5_000, timeoutMs)),
      });
      if (response.ok) return;
      lastDetail = `HTTP ${response.status}`;
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : "unreachable";
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new CliError(`Public readiness did not complete within ${Math.round(timeoutMs / 1000)} seconds (${lastDetail}).`, 1, "READINESS_TIMEOUT");
}

function secret() {
  return randomBytes(32).toString("base64url");
}

function envLine(value: string): string {
  return JSON.stringify(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

const railwayApiUrl = "https://backboard.railway.com/graphql/v2";

async function railwayApi<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(railwayApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (!response.ok || body.errors?.length) {
    throw new CliError(
      `Railway API error: ${body.errors?.map((error) => error.message).join("; ") ?? response.statusText}`,
    );
  }
  return body.data as T;
}

async function railwayCreateProject(token: string, name: string) {
  const data = await railwayApi<{
    projectCreate: {
      id: string;
      environments: { edges: Array<{ node: { id: string; name: string } }> };
    };
  }>(
    token,
    `mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) { id environments { edges { node { id name } } } }
    }`,
    { input: { name } },
  );
  const environmentId = data.projectCreate.environments.edges[0]?.node.id;
  if (!environmentId)
    throw new CliError(
      "Railway did not return a default environment for the new project.",
    );
  return { projectId: data.projectCreate.id, environmentId };
}

async function railwayCreateService(
  token: string,
  projectId: string,
  name: string,
  image: string,
) {
  const data = await railwayApi<{ serviceCreate: { id: string } }>(
    token,
    `mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id } }`,
    { input: { projectId, name, source: { image } } },
  );
  return data.serviceCreate.id;
}

async function railwaySetVariables(
  token: string,
  projectId: string,
  environmentId: string,
  serviceId: string,
  variables: Record<string, string>,
) {
  for (const [name, value] of Object.entries(variables)) {
    await railwayApi(
      token,
      `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
      { input: { projectId, environmentId, serviceId, name, value } },
    );
  }
}

async function railwayUpdateInstance(
  token: string,
  environmentId: string,
  serviceId: string,
  input: Record<string, unknown>,
) {
  await railwayApi(
    token,
    `mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }`,
    { serviceId, environmentId, input },
  );
}

async function railwayCreateVolume(
  token: string,
  projectId: string,
  environmentId: string,
  serviceId: string,
  mountPath: string,
) {
  await railwayApi(
    token,
    `mutation($input: VolumeCreateInput!) { volumeCreate(input: $input) { id } }`,
    { input: { projectId, environmentId, serviceId, mountPath } },
  );
}

async function railwayCreateDomain(
  token: string,
  environmentId: string,
  serviceId: string,
) {
  const data = await railwayApi<{ serviceDomainCreate: { domain: string } }>(
    token,
    `mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }`,
    { input: { environmentId, serviceId } },
  );
  return data.serviceDomainCreate.domain;
}

async function railwayDeploy(
  token: string,
  environmentId: string,
  serviceId: string,
) {
  await railwayApi(
    token,
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId, environmentId },
  );
}

type S3Answers = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  publicUrl: string;
};

type InitAnswers = {
  mode: ProxyMode;
  url: URL;
  port: number;
  email: string;
  organization: string;
  storage: "local" | "s3";
  s3: S3Answers | null;
  resourceProfile: ResourceProfile;
  image: string;
};

function validateEmail(value: string | undefined) {
  if (!value || !/^\S+@\S+\.\S+$/.test(value))
    return "Enter a valid email address.";
}

function validatePublicOrigin(value: string | undefined) {
  if (!value?.trim()) return "Enter a domain or public URL.";
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    const parsed = new URL(candidate);
    if (parsed.pathname !== "/" || parsed.search || parsed.hash)
      return "Use an origin without a path, query, or hash.";
  } catch {
    return "Enter a valid domain or public URL.";
  }
}

function hostSummary(host: {
  cpuCount: number;
  memoryGb: number;
  diskGb: number;
}) {
  return `${host.cpuCount} CPU · ${host.memoryGb.toFixed(1)} GB RAM · ${host.diskGb.toFixed(1)} GB free`;
}

async function collectNonInteractiveAnswers(
  directory: string,
): Promise<InitAnswers> {
  const mode = (option(parsed, "--proxy") ?? process.env.HARLY_PROXY_MODE ?? "caddy") as ProxyMode;
  if (!["caddy", "external", "local"].includes(mode))
    throw usageError("Invalid proxy mode.", "INVALID_CONFIGURATION");
  const explicitUrl = option(parsed, "--url");
  const explicitDomain = option(parsed, "--domain");
  if (explicitUrl && !explicitUrl.includes("://"))
    throw usageError("--url requires an origin with an HTTP(S) protocol.");
  const envUrl = process.env.HARLY_URL;
  const urlCandidate = explicitUrl ?? explicitDomain ?? envUrl;
  if (!urlCandidate) throw usageError("--url, --domain or HARLY_URL is required.", "MISSING_ARGUMENT");
  const url = normalizeUrl(urlCandidate, mode);
  if (explicitUrl && explicitDomain) {
    const domainUrl = normalizeUrl(explicitDomain, mode);
    if (domainUrl.origin !== url.origin)
      throw usageError("--url and --domain resolve to different origins.");
  }
  const port = Number(
    option(parsed, "--port") ?? process.env.HARLY_PORT ?? (mode === "local" && url.port ? url.port : 3000),
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw usageError("Port must be an integer between 1 and 65535.");
  const email = requiredEnvironment(
    "HARLY_INITIAL_ADMIN_EMAIL",
    option(parsed, "--email") ?? process.env.HARLY_INITIAL_ADMIN_EMAIL,
  ).toLowerCase();
  if (validateEmail(email)) throw usageError("Invalid owner email.", "INVALID_CONFIGURATION");
  const organization =
    option(parsed, "--organization")?.trim() || process.env.HARLY_ORGANIZATION?.trim() || "My organization";
  const storage = (option(parsed, "--storage") ?? process.env.STORAGE_PROVIDER ?? "local") as "local" | "s3";
  if (!["local", "s3"].includes(storage))
    throw usageError("Invalid storage provider.", "INVALID_CONFIGURATION");
  const resourceProfile = (option(parsed, "--resource-profile") ?? process.env.HARLY_RESOURCE_PROFILE ??
    detectResourceProfile()) as ResourceProfile;
  if (!Object.hasOwn(resourceProfiles, resourceProfile))
    throw usageError("Invalid resource profile.", "INVALID_CONFIGURATION");
  const s3Secret = readExplicitSecretStdin("--s3-secret-stdin", "S3_SECRET_ACCESS_KEY");
  const s3 =
    storage === "s3"
      ? {
          bucket: requiredEnvironment("S3_BUCKET", option(parsed, "--s3-bucket") ?? process.env.S3_BUCKET),
          region: option(parsed, "--s3-region")?.trim() || process.env.S3_REGION?.trim() || "auto",
          accessKeyId: requiredEnvironment(
            "S3_ACCESS_KEY_ID",
            process.env.S3_ACCESS_KEY_ID,
          ),
          secretAccessKey: requiredEnvironment(
            "S3_SECRET_ACCESS_KEY",
            s3Secret ?? process.env.S3_SECRET_ACCESS_KEY,
          ),
          endpoint: option(parsed, "--s3-endpoint")?.trim() || process.env.S3_ENDPOINT?.trim() || "",
          publicUrl: option(parsed, "--s3-public-url")?.trim() || process.env.S3_PUBLIC_URL?.trim() || "",
        }
      : null;
  const image =
    option(parsed, "--image") ?? process.env.HARLY_IMAGE_REF ?? releaseImage(flags.has("--dry-run") ? embeddedRelease : await officialRelease());
  if (image.endsWith(":latest"))
    throw new CliError(
      "Installations must pin a version or digest, never latest.",
      2,
    );
  if (!flags.has("--dry-run")) {
    await preflight(mode, true, port, directory);
    if (mode !== "local") await verifyPublicDns(url);
  }
  return {
    mode,
    url,
    port,
    email,
    organization,
    storage,
    s3,
    resourceProfile,
    image,
  };
}

async function collectInteractiveAnswers(
  directory: string,
): Promise<InitAnswers> {
  const requestedUrl = option(parsed, "--url");
  const requestedDomain = option(parsed, "--domain");
  if (requestedUrl && !requestedUrl.includes("://"))
    throw usageError("--url requires an origin with an HTTP(S) protocol.");
  const initialUrl = requestedUrl ?? requestedDomain ?? process.env.HARLY_URL ?? "careers.example.com";
  showBrand("Install", cliVersion);
  p.note(
    [
      "Point a public domain to this server.",
      "For automatic HTTPS, allow TCP 80/443 and UDP 443.",
      soft("Guide: github.com/Vytral/harly/blob/main/docs/self-hosting.md#vps-requirements"),
    ].join("\n"),
    "Before you begin",
  );

  const publicOrigin = unwrapPrompt(
    await p.text({
      message: "Public domain or subdomain",
      placeholder: "careers.example.com",
      initialValue: initialUrl,
      validate: validatePublicOrigin,
    }),
  );
  let mode = unwrapPrompt(
    await p.select<ProxyMode>({
      message: "Reverse proxy",
      initialValue:
        (option(parsed, "--proxy") as ProxyMode | undefined) ??
        (process.env.HARLY_PROXY_MODE as ProxyMode | undefined) ?? "caddy",
      options: [
        {
          value: "caddy",
          label: "Automatic HTTPS with Caddy",
          hint: "recommended",
        },
        { value: "external", label: "External Nginx or Traefik" },
        { value: "local", label: "Local HTTP only", hint: "development" },
      ],
    }),
  );
  let url = normalizeUrl(publicOrigin, mode);
  if (requestedUrl && requestedDomain) {
    const domainUrl = normalizeUrl(requestedDomain, mode);
    if (domainUrl.origin !== url.origin)
      throw usageError("--url and --domain resolve to different origins.");
  }

  const preflightSpinner = p.spinner(spinnerStyle);
  preflightSpinner.start("Checking Docker, ports, and DNS");
  let dnsAnswers: string[] = [];
  let requestedPort = Number(
    option(parsed, "--port") ?? process.env.HARLY_PORT ?? (mode === "local" && url.port ? url.port : 3000),
  );
  let host: Awaited<ReturnType<typeof preflight>> | undefined;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        host = await preflight(mode, true, requestedPort, directory);
        dnsAnswers = mode === "local" ? [] : await verifyPublicDns(url);
        break;
      } catch (error) {
        if (error instanceof RetryWithOptions) {
          preflightSpinner.message("Adjusting options and retrying preflight");
          if (error.mode) {
            mode = error.mode;
            url = normalizeUrl(publicOrigin, mode);
          }
          if (error.port !== undefined) requestedPort = error.port;
          continue;
        }
        throw error;
      }
    }
    if (!host) {
      preflightSpinner.stop("Host preflight failed");
      throw new CliError(
        "Could not complete preflight after adjusting options. Re-run the installer.",
        1,
      );
    }
    preflightSpinner.stop(
      dnsAnswers.length > 0
        ? `Server ready  ${soft(`· DNS resolved · ${dnsAnswers.length} address${dnsAnswers.length === 1 ? "" : "es"}`)}`
        : "Server ready",
    );
  } catch (error) {
    preflightSpinner.stop("Host preflight failed");
    throw error;
  }

  const email = unwrapPrompt(
    await p.text({
      message: "Initial owner email",
      placeholder: "owner@example.com",
      initialValue: option(parsed, "--email") ?? process.env.HARLY_INITIAL_ADMIN_EMAIL,
      validate: validateEmail,
    }),
  ).toLowerCase();
  const organization = unwrapPrompt(
    await p.text({
      message: "Organization name",
      placeholder: "Acme Inc.",
      initialValue: option(parsed, "--organization") ?? process.env.HARLY_ORGANIZATION ?? "My organization",
      validate: (value) =>
        value?.trim() ? undefined : "Enter an organization name.",
    }),
  );
  const storage = unwrapPrompt(
    await p.select<"local" | "s3">({
      message: "File storage",
      initialValue:
        (option(parsed, "--storage") as "local" | "s3" | undefined) ??
        (process.env.STORAGE_PROVIDER as "local" | "s3" | undefined) ?? "local",
      options: [
        { value: "local", label: "Local persistent volume", hint: "simple" },
        {
          value: "s3",
          label: "S3, R2, or MinIO",
          hint: "recommended for growth",
        },
      ],
    }),
  );

  const s3 =
    storage === "s3"
      ? {
          bucket: unwrapPrompt(
            await p.text({
              message: "S3 bucket",
              initialValue: option(parsed, "--s3-bucket") ?? process.env.S3_BUCKET,
              validate: (value) =>
                value?.trim() ? undefined : "Enter the bucket name.",
            }),
          ),
          region: unwrapPrompt(
            await p.text({
              message: "S3 region",
            initialValue: option(parsed, "--s3-region") ?? process.env.S3_REGION ?? "auto",
            }),
          ),
          accessKeyId: unwrapPrompt(
            await p.text({
              message: "S3 access key ID",
              initialValue: process.env.S3_ACCESS_KEY_ID,
              validate: (value) =>
                value?.trim() ? undefined : "Enter the access key ID.",
            }),
          ),
          secretAccessKey: unwrapPrompt(
            await p.password({
              message: "S3 secret access key",
              mask: "•",
              validate: (value) =>
                value?.trim() ? undefined : "Enter the secret access key.",
            }),
          ),
          endpoint: unwrapPrompt(
            await p.text({
              message: "S3 endpoint",
              placeholder: "Leave blank for AWS",
              initialValue: option(parsed, "--s3-endpoint") ?? process.env.S3_ENDPOINT ?? "",
            }),
          ),
          publicUrl: unwrapPrompt(
            await p.text({
              message: "S3 public URL",
              placeholder: "Optional",
              initialValue: option(parsed, "--s3-public-url") ?? process.env.S3_PUBLIC_URL ?? "",
            }),
          ),
        }
      : null;

  const detectedProfile = detectResourceProfile();
  p.log.success(
    `Server detected  ${soft(`· ${hostSummary(host)} · ${detectedProfile}`)}`,
  );
  const resourceProfile = unwrapPrompt(
    await p.select<ResourceProfile>({
      message: "Resource profile",
      initialValue:
        (option(parsed, "--resource-profile") as ResourceProfile | undefined) ??
        (process.env.HARLY_RESOURCE_PROFILE as ResourceProfile | undefined) ??
        detectedProfile,
      options: [
        { value: "compact", label: "Compact", hint: "2 GB RAM + swap" },
        { value: "standard", label: "Standard", hint: "4 GB RAM, recommended" },
        {
          value: "performance",
          label: "Performance",
          hint: "8 GB RAM or more",
        },
      ],
    }),
  );

  const image =
    option(parsed, "--image") ?? process.env.HARLY_IMAGE_REF ?? releaseImage(await officialRelease());
  if (image.endsWith(":latest"))
    throw new CliError(
      "Installations must pin a version or digest, never latest.",
      2,
    );
  const services = `PostgreSQL, migrator, app, scheduler${mode === "caddy" ? ", Caddy" : ""}`;
  const localPort = String(requestedPort);
  p.note(
    [
      `Directory   ${directory}`,
      `URL         ${url.origin}`,
      `Services    ${services}`,
      `Ports       ${mode === "caddy" ? "80, 443" : `127.0.0.1:${localPort}`}`,
      `Storage     ${storage === "local" ? "Local" : "S3-compatible"}`,
      `Profile     ${resourceProfile}`,
      `HTTPS       ${mode === "caddy" ? "Managed automatically by Caddy" : mode === "external" ? "Managed by external proxy" : "Disabled"}`,
    ].join("\n"),
    "Installation summary",
  );

  const approved = unwrapPrompt(
    await p.confirm({
      message: "Continue with this configuration?",
      initialValue: true,
    }),
  );
  if (!approved) {
    p.cancel("No files were changed.");
    throw new CliError("", 2);
  }
  return {
    mode,
    url,
    port: requestedPort,
    email,
    organization,
    storage,
    s3,
    resourceProfile,
    image,
  };
}

async function atomicWrite(file: string, contents: string, mode?: number) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  await writeFile(temp, contents, { mode });
  await rename(temp, file);
  if (mode) await chmod(file, mode);
}

async function exists(file: string) {
  return stat(file).then(
    () => true,
    () => false,
  );
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
  METRICS_TOKEN: \${METRICS_TOKEN:-}
  HARLY_SETUP_SECRET: \${HARLY_SETUP_SECRET}
  HARLY_INITIAL_ADMIN_EMAIL: \${HARLY_INITIAL_ADMIN_EMAIL}
  DOCUSEAL_URL: \${DOCUSEAL_URL:-}
  DOCUSEAL_API_TOKEN: \${DOCUSEAL_API_TOKEN:-}
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
    tmpfs: [/tmp:size=256m,mode=1777]
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
    tmpfs: [/tmp:size=64m,mode=1777]
    environment: { <<: *env, HARLY_INTERNAL_URL: http://app:3000, NODE_OPTIONS: "\${HARLY_SCHEDULER_NODE_OPTIONS:---max-old-space-size=160}" }
    depends_on: { app: { condition: service_healthy } }
    healthcheck: { test: [CMD, node, /app/runtime.mjs, doctor], interval: 30s, timeout: 10s, start_period: 45s, retries: 3 }
  caddy:
    image: caddy:2.10-alpine
    profiles: [proxy]
    restart: unless-stopped
    mem_limit: \${HARLY_CADDY_MEMORY:-256m}
    cpus: \${HARLY_CADDY_CPUS:-0.5}
    logging: *logging
    environment: { HARLY_DOMAIN: "\${HARLY_DOMAIN:-example.invalid}" }
    ports: ["80:80", "443:443", "443:443/udp"]
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile:ro", caddy-data:/data, caddy-config:/config]
    depends_on: { app: { condition: service_healthy } }
volumes: { postgres-data: {}, uploads: {}, next-cache: {}, caddy-data: {}, caddy-config: {} }
`;

const envExample = `HARLY_IMAGE=ghcr.io/vytral/harly:<version-or-digest>\nHARLY_VERSION=<version>\nHARLY_URL=https://harly.example.com\nHARLY_PORT=3000\nHARLY_DOMAIN=harly.example.com\nCOMPOSE_PROFILES=proxy\nPOSTGRES_USER=harly\nPOSTGRES_PASSWORD=<secret>\nPOSTGRES_DB=harly\nBETTER_AUTH_SECRET=<secret>\nAI_ENCRYPTION_KEY=<secret>\nSTORAGE_UPLOAD_SECRET=<secret>\nCRON_SECRET=<secret>\nMETRICS_TOKEN=<independent-secret>\nHARLY_SETUP_SECRET=<secret>\nHARLY_INITIAL_ADMIN_EMAIL=owner@example.com\nSTORAGE_PROVIDER=local\nRESEND_API_KEY=\nEMAIL_FROM=\n# Optional resource tuning (defaults target a 4 GB VPS)\nHARLY_APP_MEMORY=1536m\nHARLY_POSTGRES_MEMORY=768m\nHARLY_SCHEDULER_MEMORY=256m\nHARLY_SCHEDULER_STALE_AFTER_SECONDS=300\nHARLY_CADDY_MEMORY=256m\nHARLY_CACHE_MAX_MB=512\nHARLY_CACHE_MAX_AGE_DAYS=7\nHARLY_LOG_MAX_SIZE=10m\nHARLY_LOG_MAX_FILES=3\n`;
const envExampleWithEsign = `${envExample}# Optional DocuSeal global fallback (per-workspace config in Settings overrides)\nDOCUSEAL_URL=\nDOCUSEAL_API_TOKEN=\n# Set only when running the bundled DocuSeal service (--profile esign)\nDOCUSEAL_SECRET_KEY_BASE=\n`;

async function init() {
  const positionalDirectory = positionals[0];
  const outputDirectory = option(parsed, "--output-dir");
  if (positionals.length > 1)
    throw usageError("init accepts only one directory positional argument.");
  if (positionalDirectory && outputDirectory) {
    const positionalPath = path.resolve(positionalDirectory);
    const outputPath = path.resolve(outputDirectory);
    if (positionalPath !== outputPath)
      throw usageError("init positional directory and --output-dir must point to the same path.");
  }
  const directory = path.resolve(outputDirectory ?? positionalDirectory ?? "harly");
  const dryRun = flags.has("--dry-run");
  const answers = interactive
    ? await collectInteractiveAnswers(directory)
    : await collectNonInteractiveAnswers(directory);
  const {
    mode,
    url,
    port,
    email,
    organization,
    storage,
    s3,
    resourceProfile,
    image,
  } = answers;
  const resources = resourceProfiles[resourceProfile];
  const generationSpinner = interactive && !dryRun ? p.spinner(spinnerStyle) : null;
  if (!dryRun) generationSpinner?.start("Generating secure configuration");
  let setupSecret: string | undefined;
  let envWritten = false;
  const wouldCreate: string[] = [];
  try {
    if (!dryRun) await mkdir(directory, { recursive: true });

    const envPath = path.join(directory, ".env");
    if (!(await exists(envPath))) {
      setupSecret = secret();
      const env = [
        `HARLY_IMAGE=${envLine(image)}`,
        // A digest-pinned install used to record the literal string "digest"
        // here, which the app then reported as its version at
        // /api/health/ready and in its OpenAPI document. Resolve the release
        // name instead; the digest is already recorded in HARLY_IMAGE.
        `HARLY_VERSION=${envLine(envVersion(describeImage(image, dryRun ? embeddedRelease : await officialRelease())))}`,
        `HARLY_URL=${envLine(url.origin)}`,
        `HARLY_PORT=${envLine(String(port))}`,
        `HARLY_DOMAIN=${envLine(url.hostname)}`,
        `COMPOSE_PROFILES=${envLine(mode === "caddy" ? "proxy" : "")}`,
        `POSTGRES_USER=${envLine("harly")}`,
        `POSTGRES_PASSWORD=${envLine(secret())}`,
        `POSTGRES_DB=${envLine("harly")}`,
        `BETTER_AUTH_SECRET=${envLine(secret())}`,
        `AI_ENCRYPTION_KEY=${envLine(secret())}`,
        `STORAGE_UPLOAD_SECRET=${envLine(secret())}`,
        `CRON_SECRET=${envLine(secret())}`,
        `HARLY_SETUP_SECRET=${envLine(setupSecret)}`,
        `HARLY_INITIAL_ADMIN_EMAIL=${envLine(email)}`,
        "DOCUSEAL_URL=",
        "DOCUSEAL_API_TOKEN=",
        `STORAGE_PROVIDER=${envLine(storage)}`,
        ...(s3
          ? [
              `S3_BUCKET=${envLine(s3.bucket)}`,
              `S3_REGION=${envLine(s3.region)}`,
              `S3_ACCESS_KEY_ID=${envLine(s3.accessKeyId)}`,
              `S3_SECRET_ACCESS_KEY=${envLine(s3.secretAccessKey)}`,
              `S3_ENDPOINT=${envLine(s3.endpoint)}`,
              `S3_PUBLIC_URL=${envLine(s3.publicUrl)}`,
            ]
          : []),
        "RESEND_API_KEY=",
        "EMAIL_FROM=",
        `HARLY_APP_MEMORY=${resources.app}`,
        `HARLY_APP_NODE_OPTIONS=${resources.appNodeOptions}`,
        `HARLY_POSTGRES_MEMORY=${resources.postgres}`,
        `HARLY_MIGRATE_MEMORY=${resources.migrate}`,
        `HARLY_SCHEDULER_MEMORY=${resources.scheduler}`,
        "HARLY_SCHEDULER_STALE_AFTER_SECONDS=300",
        `HARLY_CADDY_MEMORY=${resources.caddy}`,
        `HARLY_CACHE_MAX_MB=${resources.cacheMb}`,
        "HARLY_CACHE_MAX_AGE_DAYS=7",
        "HARLY_LOG_MAX_SIZE=10m",
        "HARLY_LOG_MAX_FILES=3",
        "",
      ].join("\n");
      if (dryRun) {
        wouldCreate.push(".env (mode 0600, contains random secrets)");
      } else {
        await atomicWrite(envPath, env, 0o600);
        // atomicWrite only chmods when the file did not exist. Confirm and
        // repair so the secrets file is owner-read-write-only.
        const stat_ = await stat(envPath);
        if ((stat_.mode & 0o777) !== 0o600) await chmod(envPath, 0o600);
        envWritten = true;
      }
    }

    const config: HarlyFileConfig = {
      version: 1,
      proxyMode: mode,
      publicUrl: url.origin,
      image,
      organizationName: organization,
      initialAdminEmail: email,
      storage,
      resourceProfile,
    };
    const templates: Array<[string, string, number?]> = [
      ["compose.yaml", composeTemplate],
      [
        "Caddyfile",
        "{$HARLY_DOMAIN} {\n  encode zstd gzip\n  reverse_proxy app:3000\n}\n",
      ],
      [".env.example", envExampleWithEsign],
      [".gitignore", ".env\nbackups/\n"],
      ["harly.config.json", `${JSON.stringify(config, null, 2)}\n`],
      [
        "README.md",
        `# Harly self-host\n\nBefore launching Caddy, make sure ${url.hostname} has an A record pointing to this VPS and that TCP 80/443 plus UDP 443 are allowed by the firewall. If another reverse proxy owns those ports, use external proxy mode and forward it to 127.0.0.1:3000.\n\n- Open management: \`npx @harly/cli\`\n- Diagnose: \`npx @harly/cli doctor\`\n- Backup before every update.\n- Complete the first owner at ${url.origin}/setup using HARLY_SETUP_SECRET from .env.\n`,
      ],
    ];
    for (const [name, contents, modeBits] of templates) {
      const target = path.join(directory, name);
      const existsAlready = await exists(target);
      if (dryRun) {
        if (!existsAlready || force) wouldCreate.push(name);
      } else if (!existsAlready || force) {
        await atomicWrite(target, contents, modeBits);
      }
    }
  } catch (error) {
    generationSpinner?.stop("Configuration generation failed");
    throw error;
  }
  if (dryRun) {
    const header = `${directory}/`;
    const lines = [
      "",
      `  ${ink("Dry run — no files were written.")}`,
      "",
      `  ${header}`,
      ...wouldCreate.map((name) => `    ${accent("+")} ${name}`),
      "",
    ];
    if (json) {
      writeResult(resultOk("init", "dry-run", {
        resolvedConfig: { directory, url: url.origin, proxy: mode, storage, resourceProfile },
        artifacts: wouldCreate.map((name) => name.split(" ")[0]),
        operations: {
          local: ["preflight", "generate configuration", ...(flags.has("--launch") ? ["pull image", "start services", "verify readiness"] : [])],
          remote: mode === "local" ? [] : ["verify public DNS"],
        },
        sideEffects: false,
      }));
    } else {
      humanOut(`${lines.join("\n")}\n`);
    }
    if (interactive) p.outro("Re-run without --dry-run to write these files.");
    return;
  }
  generationSpinner?.stop("Configuration ready");

  if (interactive) {
    const launchNow = flags.has("--launch")
      ? true
      : flags.has("--no-launch")
        ? false
        : unwrapPrompt(await p.confirm({ message: "Install and launch Harly now?", initialValue: true }));
    if (launchNow) {
      await launch(directory, true, false);
      printInstallOutro({
        url: url.origin,
        email,
        mode,
        setupSecret: setupSecret ?? "",
        envWritten,
        directory,
      });
    } else {
      p.outro(
        `Next: ${accent(`cd ${shellQuote(directory)} && npx @harly/cli`)}`,
      );
      if (setupSecret) {
        humanOut(
          `\nSetup secret (copy and keep it safe — you will need it at ${url.origin}/setup):\n  ${accent(setupSecret)}\n\n`,
        );
      }
    }
  } else {
    if (flags.has("--launch")) {
      await launch(directory, true, false);
      if (jsonResultWritten) return;
    }
    const result = resultOk("init", flags.has("--launch") ? "ready" : "generated", {
      directory,
      url: url.origin,
      mode,
      resourceProfile,
      image,
      artifacts: [".env", ".env.example", ".gitignore", "Caddyfile", "README.md", "compose.yaml", "harly.config.json"],
      ...(flags.has("--launch") ? {} : { next: [`cd ${shellQuote(directory)} && npx @harly/cli launch --yes`] }),
    });
    if (json) {
      writeResult(result);
      return;
    }
    humanOut(
      `\nGenerated ${directory}\nImage: ${image}\nMode: ${mode}\nResource profile: ${resourceProfile}\nServices: postgres, migrate, app, scheduler${mode === "caddy" ? ", caddy" : ""}\nVolumes: postgres-data, uploads, next-cache${mode === "caddy" ? ", caddy-data, caddy-config" : ""}\n`,
    );
    if (setupSecret) {
      humanOut(
        `\nSetup secret: ${setupSecret}\nUse it at ${url.origin}/setup to claim the owner account.\n\n`,
      );
    } else {
      humanOut("\n");
    }
  }
}

function printInstallOutro(args: {
  url: string;
  email: string;
  mode: ProxyMode;
  setupSecret: string;
  envWritten: boolean;
  directory: string;
}) {
  const { url, email, mode, setupSecret, envWritten, directory } = args;
  p.log.success(`Harly is running at ${accent(url)}`);
  const lines: string[] = [];
  if (setupSecret) {
    lines.push("");
    lines.push(`To finish setup, open ${accent(url)} and enter the secret below:`);
    lines.push("");
    lines.push(`  ${accent(setupSecret)}`);
    lines.push("");
    lines.push(
      `Then sign in as ${accent(email)}. The secret is also in ${accent(`${directory}/.env`)} (line HARLY_SETUP_SECRET) for later reference.`,
    );
  } else if (envWritten) {
    lines.push("");
    lines.push(
      `Open ${accent(url)} to finish setup. The setup secret is in ${accent(`${directory}/.env`)} (HARLY_SETUP_SECRET).`,
    );
  } else {
    lines.push("");
    lines.push(`Open ${accent(url)} to finish setup.`);
  }
  lines.push("");
  lines.push("After setup:");
  lines.push(
    ...rows([
      { label: accent("harly doctor"), detail: "verify the public route" },
      { label: accent("harly backup"), detail: "write a private rollback point" },
      { label: accent("harly update"), detail: "apply future upgrades safely" },
    ]).map((row) => `  ${row}`),
  );
  if (mode === "caddy") {
    lines.push("");
    lines.push(
      soft(
        "If HTTPS does not load, check that TCP 80/443 and UDP 443 are open in the cloud security group.",
      ),
    );
  }
  // Only the first line of `p.outro` carries the rail; the setup secret is the
  // one thing here an operator must read and retype, so it goes in a rail-
  // prefixed block and the outro keeps a single closing line.
  p.log.message(lines.join("\n").replace(/^\n/, ""));
  p.outro(`Harly is ready at ${accent(url)}`);
}

function renderHostCheck(
  host: HostSummary,
  options: { ports?: Array<{ port: number; protocol: "tcp" | "udp"; detail: string }> } = {},
) {
  const rows: Array<{ label: string; status: "ok" | "warn" | "fail"; detail: string; fix?: string }> = [];
  rows.push({
    label: "Host",
    status: "ok",
    detail: `${host.distro}, ${host.cpuCount} CPU, ${host.freeMemoryGb.toFixed(1)} GB free of ${host.memoryGb.toFixed(1)} GB`,
  });
  if (host.docker) {
    rows.push({
      label: "Docker",
      status: "ok",
      detail: `Engine ${host.docker.engine} (need ≥ 24)`,
    });
    rows.push({
      label: "Compose",
      status: "ok",
      detail: `${host.docker.compose} (need ≥ 2.20)`,
    });
  } else {
    rows.push({
      label: "Docker",
      status: "fail",
      detail: "missing",
      fix: "Install Docker Engine 24+",
    });
  }
  const requiredDiskGb = Number(process.env.HARLY_REQUIRED_DISK_GB ?? 5);
  rows.push({
    label: "Disk",
    status: host.diskGb >= requiredDiskGb ? "ok" : "fail",
    detail: `${host.diskGb.toFixed(1)} GB free`,
    ...(host.diskGb < requiredDiskGb
      ? { fix: `Free at least ${requiredDiskGb} GB on the install path` }
      : {}),
  });
  if (host.firewall) {
    rows.push({
      label: "Firewall",
      status: "warn",
      detail: host.firewall.detail,
      fix: `Run: ${host.firewall.fix}`,
    });
  }
  for (const port of options.ports ?? []) {
    rows.push({ label: `Port ${port.port}`, status: "warn", detail: port.detail });
  }

  const labelWidth = Math.max(...rows.map((row) => row.label.length));
  const glyph = (status: "ok" | "warn" | "fail") =>
    status === "ok" ? accent("✓") : status === "warn" ? pc.yellow("⚠") : pc.red("✗");
  const lines = ["", `  ${ink("Harly self-host requirements")}`, ""];
  for (const row of rows) {
    lines.push(
      `  ${glyph(row.status)} ${row.label.padEnd(labelWidth)}  ${row.detail}`,
    );
    if (row.fix) lines.push(`  ${" ".repeat(labelWidth + 4)}${soft(row.fix)}`);
  }
  return lines.join("\n");
}

async function harlyCheck(directory = process.cwd()) {
  const spinner = interactive ? p.spinner(spinnerStyle) : null;
  spinner?.start("Checking host");
  const host = await preflightHost(directory);
  spinner?.stop("Host checked");

  const portChecks: Array<{ port: number; protocol: "tcp" | "udp"; detail: string }> = [];
  for (const portSpec of [80, 443] as const) {
    const available = await portAvailable(portSpec);
    if (!available) {
      const owner = portOwner(portSpec, "tcp");
      portChecks.push({
        port: portSpec,
        protocol: "tcp",
        detail: owner ? `busy (${owner})` : "busy",
      });
    }
  }
  const output = renderHostCheck(host, { ports: portChecks });

  const requiredDiskGb = Number(process.env.HARLY_REQUIRED_DISK_GB ?? 5);
  const allOk =
    !host.firewall &&
    portChecks.length === 0 &&
    host.diskGb >= requiredDiskGb;
  if (json) {
    writeResult(resultOk("check", allOk ? "ready" : "failed", {
      report: output,
      host,
      ports: portChecks,
    }));
    if (!allOk) process.exitCode = 1;
    return;
  }
  process.stdout.write(`${output}\n\n`);
  if (interactive) {
    if (allOk) {
      p.log.success("Your host is ready. Run `harly init` to install Harly.");
    } else {
      p.log.warn("Some checks need attention. Resolve them above, then run `harly init`.");
    }
  } else {
    if (!allOk) process.exitCode = 1;
  }
}

async function setupSecret(explicitDirectory?: string) {
  const directory = path.resolve(
    explicitDirectory ?? positionals[0] ?? process.cwd(),
  );
  let envPath = path.join(directory, ".env");
  if (!(await exists(envPath))) {
    const installation = await findInstallation(directory);
    if (!installation) {
      throw new CliError(
        `No .env file found at ${envPath}. Run \`harly init\` first.`,
        1,
      );
    }
    envPath = path.join(installation.directory, ".env");
  }
  let env: string;
  try {
    env = await readFile(envPath, "utf8");
  } catch {
    throw new CliError(`Cannot read ${envPath}. Check file permissions.`, 1);
  }
  const match = env.match(/^HARLY_SETUP_SECRET=(?:"([^"]+)"|(\S+))$/m);
  if (!match) {
    throw new CliError(
      `HARLY_SETUP_SECRET is missing from ${envPath}. The install may be incomplete.`,
      1,
    );
  }
  const secret = match[1] ?? match[2] ?? "";
  if (!secret) {
    throw new CliError(`HARLY_SETUP_SECRET is empty in ${envPath}.`, 1);
  }
  if (json) {
    writeResult(resultOk("setup-secret", "available", {
      directory: path.dirname(envPath),
      secretAvailable: true,
    }));
  } else {
    process.stdout.write(`${secret}\n`);
  }
}

async function readConfig(directory: string): Promise<HarlyFileConfig> {
  try {
    return JSON.parse(
      await readFile(path.join(directory, "harly.config.json"), "utf8"),
    ) as HarlyFileConfig;
  } catch {
    throw new CliError(
      "harly.config.json is missing or invalid. Run init first.",
    );
  }
}

type Installation = { directory: string; config: HarlyFileConfig };

/** Finds only the installation that contains the caller. We intentionally never
 * scan siblings or the home directory: choosing the wrong deployment is worse
 * than asking the operator to cd into it. */
async function findInstallation(
  start = process.cwd(),
): Promise<Installation | null> {
  let directory = path.resolve(start);
  while (true) {
    const configPath = path.join(directory, "harly.config.json");
    if (await exists(configPath)) {
      try {
        return { directory, config: await readConfig(directory) };
      } catch {
        throw new CliError(
          `Found an invalid Harly configuration at ${configPath}. Fix or remove it before starting a new installation.`,
          2,
        );
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

type ServiceWaitResult = { ready: boolean; detail: string };

/** Poll a service until it is ready. One-shot services (migrate) are ready
 * when they exit 0; long-running services are ready when their Docker
 * healthcheck reports healthy. */
async function waitForService(
  cwd: string,
  service: string,
  timeoutMs: number,
): Promise<ServiceWaitResult> {
  const isOneShot = service === "migrate";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = run(
      "docker",
      ["compose", "ps", "-a", "--format", "json", service],
      { cwd, allowFailure: true },
    );
    if (result.status === 0) {
      const stdout = String(result.stdout ?? "").trim();
      if (stdout) {
        try {
          const parsed = JSON.parse(stdout);
          const item = Array.isArray(parsed) ? parsed[0] : parsed;
          if (item) {
            if (isOneShot) {
              if (item.State === "exited" && item.ExitCode === 0) {
                return { ready: true, detail: "applied" };
              }
              if (item.State === "exited" && item.ExitCode !== 0) {
                return { ready: false, detail: `exited ${item.ExitCode}` };
              }
            } else {
              if (item.State === "running" && item.Health === "healthy") {
                return { ready: true, detail: "healthy" };
              }
              if (item.State === "exited") {
                return {
                  ready: false,
                  detail: `exited ${item.ExitCode ?? "?"}`,
                };
              }
            }
          }
        } catch {
          // malformed JSON, retry
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return { ready: false, detail: "timeout" };
}

function formatLaunchLine(
  service: string,
  ready: boolean,
  detail: string,
  elapsedSec: number,
): string {
  const glyph = ready ? accent("✓") : pc.red("✗");
  const label = ready
    ? `${service} ready`
    : `${service} ${detail}`;
  return `  ${glyph} ${label.padEnd(28)} ${soft(`· ${elapsedSec.toFixed(1)}s`)}`;
}

async function launch(explicitDirectory?: string, confirmed = false, emit = true) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  if (interactive && !confirmed) {
    showBrand("Launch");
    const identity = describeImage(
      config.requestedImage ?? config.image,
      await officialRelease(),
    );
    p.log.message(
      rows([
        { icon: icon.image(), label: "Version", detail: versionLine(identity) },
        { icon: icon.proxy(), label: "Mode", detail: config.proxyMode },
        { icon: icon.network(), label: "URL", detail: config.publicUrl },
      ]).join("\n"),
    );
  } else if (!interactive) {
    humanOut(
      `Image: ${config.image}\nMode: ${config.proxyMode}\nCommands: docker compose pull; docker compose up -d --wait\n`,
    );
  }
  if (!confirmed && !yes && !(await confirm("Continue?"))) {
    if (!process.stdin.isTTY)
      throw new CliError("--yes is required in non-interactive mode.", 2);
    throw new CliError("Launch cancelled.", 2);
  }
  progressStep(
    "Validating configuration",
    "Configuration validated",
    () => compose(directory, ["config", "--quiet"]),
  );
  await pullWithProgress(directory, [], interactive);

  // Start the services. We poll each one ourselves instead of using
  // `compose up --wait` so the operator can see per-service timing and which
  // service stalled if something goes wrong.
  compose(directory, ["up", "-d"], { allowFailure: false });

  const ordered = ["postgres"];
  if (config.proxyMode === "caddy") ordered.push("caddy");
  ordered.push("migrate", "app", "scheduler");

  const results: Array<{ service: string; ready: boolean; elapsedSec: number; detail: string }> = [];
  for (const service of ordered) {
    const step = interactive ? p.spinner(spinnerStyle) : null;
    const start = Date.now();
    if (interactive) {
      step?.start(`Waiting for ${service}`);
    } else {
      humanOut(`  … ${service}\n`);
    }
    const result = await waitForService(directory, service, 90_000);
    const elapsedSec = (Date.now() - start) / 1000;
    if (interactive) {
      const line = formatLaunchLine(service, result.ready, result.detail, elapsedSec);
      step?.stop(line);
    } else {
      humanOut(
        `${formatLaunchLine(service, result.ready, result.detail, elapsedSec)}\n`,
      );
    }
    results.push({ service, ready: result.ready, elapsedSec, detail: result.detail });
  }

  // Public URL smoke test (best-effort; not fatal on transient TLS issues).
  let publicOk = false;
  try {
    const response = await fetch(`${config.publicUrl}/api/health/ready`, {
      signal: AbortSignal.timeout(5_000),
    });
    publicOk = response.ok;
  } catch {
    publicOk = false;
  }
  if (interactive) {
    p.log.message(
      rows([
        {
          icon: icon.network(),
          label: "Public URL",
          detail: config.publicUrl,
          status: publicOk ? "ok" : "warn",
        },
      ]).join("\n"),
    );
  } else {
    humanOut(
      `${formatLaunchLine(
        "public",
        publicOk,
        publicOk ? "ready" : "not reachable",
        0,
      )} ${soft(config.publicUrl)}\n`,
    );
  }

  const allReady = results.every((r) => r.ready);
  if (!allReady) {
    throw new CliError(
      `One or more services did not become healthy:\n${results
        .filter((r) => !r.ready)
        .map((r) => `  - ${r.service}: ${r.detail}`)
        .join("\n")}\nRun \`harly doctor ${directory}\` to inspect.`,
      1,
    );
  }
  if (interactive && !confirmed) {
    p.log.message(
      `${accent(config.publicUrl)}\n${soft(`Run ${accent("harly doctor")} to verify the installation.`)}`,
    );
    p.outro("Harly is ready");
  } else if (!interactive) {
    if (json && emit) {
      writeResult(resultOk("launch", "ready", {
        directory,
        url: config.publicUrl,
        image: config.image,
        services: results.reduce<Record<string, string>>((acc, item) => {
          acc[item.service] = item.ready ? "ready" : "failed";
          return acc;
        }, {}),
      }));
    }
    humanOut(
      `Harly is ready at ${config.publicUrl}. Run \`harly doctor\` to verify.\n`,
    );
  }
}

async function runDoctorFix(directory: string, config: HarlyFileConfig) {
  if (!interactive) {
    p.log.warn("--fix requires an interactive terminal.");
    return;
  }
  const servicesResult = compose(
    directory,
    ["ps", "--status", "running", "--services"],
    { allowFailure: true },
  );
  const running = String(servicesResult.stdout ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const expected = ["postgres", "app", "scheduler", ...(config.proxyMode === "caddy" ? ["caddy"] : [])];
  const stopped = expected.filter((name) => !running.includes(name));
  if (stopped.length === 0) {
    p.log.info("All expected services are running. Nothing to restart.");
    return;
  }
  const action = unwrapPrompt(
    await p.select({
      message: `${stopped.join(", ")} ${stopped.length === 1 ? "is" : "are"} not running. What do you want to do?`,
      options: [
        { value: "restart", label: `Restart ${stopped.join(", ")}`, hint: "docker compose restart <service>" },
        { value: "up", label: "Bring everything up", hint: "docker compose up -d" },
        { value: "logs", label: "Show container logs first", hint: "docker compose logs --tail=100 <service>" },
        { value: "abort", label: "Cancel" },
      ],
    }),
  );
  if (p.isCancel(action) || action === "abort") return;
  if (action === "logs") {
    p.log.info("Inspect logs with: docker compose logs --tail=100 " + stopped[0]);
    return;
  }
  if (action === "restart") {
    const spin = p.spinner(spinnerStyle);
    spin.start(`Restarting ${stopped.join(", ")}`);
    compose(directory, ["restart", ...stopped]);
    spin.stop(`Restart issued. Run \`harly doctor\` to verify.`);
    return;
  }
  if (action === "up") {
    const spin = p.spinner(spinnerStyle);
    spin.start("Starting services");
    compose(directory, ["up", "-d"]);
    spin.stop("Services started. Run `harly doctor` to verify.");
  }
}

async function doctor(explicitDirectory?: string, print = true) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  // `name` is the stable machine key consumed by --json and by automation.
  // `label` exists only to render a human sentence.
  const checks: Array<{
    name: string;
    label: string;
    ok: boolean;
    detail?: string;
  }> = [];
  const valid = compose(directory, ["config", "--quiet"], {
    allowFailure: true,
  });
  checks.push({
    name: "compose",
    label: "Compose file is valid",
    ok: valid.status === 0,
  });
  const servicesResult = compose(
    directory,
    ["ps", "--status", "running", "--services"],
    { allowFailure: true },
  );
  const services = String(servicesResult.stdout ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const serviceLabels: Record<string, string> = {
    postgres: "Database is running",
    app: "Application is running",
    scheduler: "Scheduler is running",
    caddy: "HTTPS proxy is running",
  };
  for (const name of [
    "postgres",
    "app",
    "scheduler",
    ...(config.proxyMode === "caddy" ? ["caddy"] : []),
  ])
    checks.push({
      name: `service:${name}`,
      label: serviceLabels[name] ?? `${name} is running`,
      ok: services.includes(name),
    });
  checks.push({
    name: "profile:caddy",
    label:
      config.proxyMode === "caddy"
        ? "Proxy profile matches this installation"
        : "No stray proxy is running",
    ok:
      config.proxyMode === "caddy"
        ? services.includes("caddy")
        : !services.includes("caddy"),
  });
  try {
    const response = await fetch(`${config.publicUrl}/api/health/ready`, {
      signal: AbortSignal.timeout(5_000),
    });
    checks.push({
      name: "readiness",
      label: "Public URL answers as ready",
      ok: response.ok,
      detail: `HTTP ${response.status}`,
    });
  } catch {
    checks.push({
      name: "readiness",
      label: "Public URL answers as ready",
      ok: false,
      detail: "unreachable",
    });
  }
  const result = {
    ok: checks.every((check) => check.ok),
    proxyMode: config.proxyMode,
    image: config.image,
    checks,
  };
  if (print) {
    if (json) {
      writeResult(resultOk("doctor", result.ok ? "ready" : "failed", result));
    } else if (interactive) {
      // The machine keys (`service:postgres`) stay in --json and in the
      // non-interactive stream below, where automation reads them. Printing
      // them to an operator watching an install is noise.
      const glyphs: Record<string, string> = {
        compose: icon.config(),
        "service:postgres": icon.database(),
        "service:app": icon.app(),
        "service:scheduler": icon.scheduler(),
        "service:caddy": icon.proxy(),
        "profile:caddy": icon.proxy(),
        readiness: icon.network(),
      };
      const body = rows(
        checks.map((check) => ({
          icon: glyphs[check.name],
          label: check.label,
          detail: check.detail,
          status: check.ok ? ("ok" as const) : ("fail" as const),
        })),
      );
      p.log.message(body.join("\n"));
      if (result.ok) p.log.success("Harly is healthy.");
      else p.log.error("Harly needs attention.");
    } else {
      process.stdout.write(
        `\n${checks
          .map(
            (check) =>
              `  ${check.ok ? accent("✓") : pc.red("✗")} ${check.label}${
                check.detail ? ` ${soft(`· ${check.detail}`)}` : ""
              }  ${soft(check.name)}`,
          )
          .join("\n")}\n\n  ${
          result.ok
            ? accent("Harly is healthy.")
            : pc.red("Harly needs attention.")
        }\n\n`,
      );
    }
  }
  if (!result.ok && print) process.exitCode = 1;
  if (
    !result.ok &&
    flags.has("--fix") &&
    interactive &&
    !json
  ) {
    await runDoctorFix(directory, config);
  }
  return result;
}

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function checksums(
  directory: string,
  prefix = "",
): Promise<Record<string, string>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: Record<string, string> = {};
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory())
      Object.assign(result, await checksums(absolute, relative));
    else if (entry.isFile())
      result[relative] = sha256(await readFile(absolute));
  }
  return result;
}

async function deploymentEnvironment(directory: string) {
  const contents = await readFile(path.join(directory, ".env"), "utf8");
  const values = new Map<string, string>();
  for (const line of contents.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    try {
      values.set(match[1]!, JSON.parse(match[2]!));
    } catch {
      values.set(match[1]!, match[2]!);
    }
  }
  return values;
}

async function deploymentDatabase(directory: string) {
  const values = await deploymentEnvironment(directory);
  return {
    user: values.get("POSTGRES_USER") || "harly",
    database: values.get("POSTGRES_DB") || "harly",
  };
}

/**
 * Writes a rollback archive and returns its path.
 *
 * `print` exists because this function has two callers with opposite needs.
 * Standalone `harly backup` is a scripting primitive: the bare path on stdout
 * is its output contract, so `$(harly backup)` keeps working. Inside `upgrade`
 * the same raw write lands in the middle of a Clack flow, severing the vertical
 * rail; there the caller reports the archive as a numbered phase instead.
 */
async function backup(
  explicitDirectory?: string,
  print = true,
): Promise<string> {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  const database = await deploymentDatabase(directory);
  const recipient =
    process.env.AGE_RECIPIENT ??
    (await deploymentEnvironment(directory)).get("AGE_RECIPIENT");
  const encrypt = flags.has("--encrypt");
  if (encrypt && !recipient)
    throw new CliError(
      "--encrypt requires AGE_RECIPIENT. See the advanced encryption guide.",
    );
  const temp = await mkdtemp(path.join(os.tmpdir(), "harly-backup-"));
  const outputDirectory = path.join(directory, "backups");
  await mkdir(outputDirectory, { recursive: true });
  compose(directory, ["stop", "app", "scheduler"], { allowFailure: true });
  try {
    const dump = compose(
      directory,
      [
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        database.user,
        "-d",
        database.database,
        "-Fc",
      ],
      { binary: true },
    );
    const bytes = Buffer.isBuffer(dump.stdout)
      ? dump.stdout
      : Buffer.from(dump.stdout);
    await writeFile(path.join(temp, "database.dump"), bytes);
    await cp(path.join(directory, ".env"), path.join(temp, ".env"));
    await cp(
      path.join(directory, "harly.config.json"),
      path.join(temp, "harly.config.json"),
    );
    if (config.storage === "local")
      compose(directory, [
        "cp",
        "app:/data/uploads/.",
        path.join(temp, "uploads"),
      ]);
    const manifest = {
      version: config.image,
      createdAt: new Date().toISOString(),
      storage: config.storage,
      uploads:
        config.storage === "local" ? "included" : "external-s3-not-included",
      files: await checksums(temp),
    };
    await writeFile(
      path.join(temp, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    const archive = path.join(
      outputDirectory,
      `harly-${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz`,
    );
    run("tar", ["-czf", archive, "-C", temp, "."]);
    await chmod(archive, 0o600);
    // A mode-0600 archive is the automatic local rollback point used before
    // updates. It is intentionally dependency-free, but not a replacement for
    // an off-host disaster-recovery backup.
    if (!encrypt) {
      if (print) process.stdout.write(`${archive}\n`);
      return archive;
    }
    const encrypted = `${archive}.age`;
    run("age", ["-r", recipient!, "-o", encrypted, archive]);
    await chmod(encrypted, 0o600);
    await rm(archive, { force: true });
    if (print) process.stdout.write(`${encrypted}\n`);
    return encrypted;
  } finally {
    compose(directory, ["up", "-d", "app", "scheduler"], {
      allowFailure: true,
    });
    await rm(temp, { recursive: true, force: true });
  }
}

async function restore() {
  const archiveArg = positionals[0];
  if (!archiveArg) throw new CliError("restore requires an archive path.", 2);
  if (!force)
    throw new CliError(
      "restore requires --force after you verify the destination and backup.",
      2,
    );
  const archive = path.resolve(archiveArg);
  const directory = path.resolve(positionals[1] ?? ".");
  const config = await readConfig(directory);
  const database = await deploymentDatabase(directory);
  const temp = await mkdtemp(path.join(os.tmpdir(), "harly-restore-"));
  let plaintext = archive;
  if (archive.endsWith(".age")) {
    plaintext = path.join(temp, "backup.tar.gz");
    const identity = process.env.AGE_IDENTITY;
    if (!identity)
      throw new CliError("AGE_IDENTITY is required to decrypt this backup.");
    run("age", ["-d", "-i", identity, "-o", plaintext, archive]);
  }
  run("tar", ["-xzf", plaintext, "-C", temp]);
  const manifest = JSON.parse(
    await readFile(path.join(temp, "manifest.json"), "utf8"),
  ) as { files: Record<string, string>; storage?: "local" | "s3" };
  const actual = await checksums(temp);
  for (const [file, checksum] of Object.entries(manifest.files)) {
    if (actual[file] !== checksum)
      throw new CliError(`Backup checksum verification failed for ${file}.`);
  }
  if (manifest.storage === "s3" || config.storage === "s3") {
    process.stderr.write(
      "This backup does not include S3 objects. Verify the bucket backup/version history before restoring.\n",
    );
  }
  // Never destroy a deployment without first proving that its present state is
  // recoverable. This also makes an accidental restore reversible.
  process.stdout.write("Creating a safety backup of the current deployment…\n");
  await backup(directory);
  process.stdout.write("Safety backup saved. Preparing restore…\n");
  // The safety backup restarts dependencies. Stop the one-shot migration
  // service too: otherwise it can race pg_restore and recreate tables while
  // the database is being restored.
  compose(directory, ["stop", "app", "scheduler", "migrate"], {
    allowFailure: true,
  });
  try {
    // `docker compose exec` does not reliably preserve a binary stdin stream
    // across every supported Docker Desktop/Compose combination. Copy the
    // verified dump into Postgres instead, then restore it by filename.
    process.stdout.write("Restoring database…\n");
    compose(directory, [
      "cp",
      path.join(temp, "database.dump"),
      "postgres:/tmp/harly-restore.dump",
    ]);
    compose(directory, [
      "exec",
      "-T",
      "postgres",
      "pg_restore",
      "-U",
      database.user,
      "-d",
      database.database,
      "--clean",
      "--if-exists",
      "/tmp/harly-restore.dump",
    ]);
    compose(
      directory,
      ["exec", "-T", "postgres", "rm", "-f", "/tmp/harly-restore.dump"],
      { allowFailure: true },
    );
    if (await exists(path.join(temp, "uploads"))) {
      process.stdout.write("Restoring local uploads…\n");
      compose(directory, [
        "run",
        "--rm",
        "--entrypoint",
        "sh",
        "app",
        "-c",
        "rm -rf /data/uploads/* /data/uploads/.[!.]* /data/uploads/..?*",
      ]);
      compose(directory, [
        "cp",
        `${path.join(temp, "uploads")}/.`,
        "app:/data/uploads",
      ]);
    }
    process.stdout.write("Applying migrations…\n");
    compose(directory, ["run", "--rm", "migrate"]);
  } finally {
    compose(directory, ["up", "-d", "app", "scheduler"], {
      allowFailure: true,
    });
  }
  const result = await doctor(directory, false);
  if (!result.ok)
    throw new CliError(
      "Restore completed but Harly did not become healthy. Your safety backup was preserved; run `harly doctor` and inspect `docker compose logs` before retrying.",
    );
  process.stdout.write("Restore complete. Harly is healthy.\n");
}

async function upgrade(explicitDirectory?: string) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  await preflight(config.proxyMode, false);
  if (toVersion === "latest")
    throw new CliError(
      "latest is not allowed. Use edge for previews or a fixed version.",
      2,
    );

  const requestedImage = toVersion
    ? toVersion.startsWith("ghcr.io/")
      ? toVersion
      : `ghcr.io/vytral/harly:${toVersion}`
    : (config.requestedImage ?? config.image);
  const release = await officialRelease();
  const currentIdentity = describeImage(config.image, release);
  // The target is described from the reference alone. Inspecting it here would
  // read the OCI labels of whatever copy of that tag is already on disk — the
  // *outgoing* build — and report its commit as the incoming one. The real
  // build commit is only knowable after the pull, as `deployedIdentity`.
  const targetIdentity = describeImage(requestedImage, release, () => null);
  if (
    !yes &&
    !(await confirm(
      `Update Harly from ${versionLine(currentIdentity)} to ${versionLine(targetIdentity)}?`,
    ))
  ) {
    if (!interactive)
      throw new CliError("--yes is required in non-interactive mode.", 2);
    throw new CliError("Upgrade cancelled.", 2);
  }


  if (interactive) {
    showBrand("Update");
    p.log.message(
      rows([
        {
          icon: icon.image(),
          label: "Current",
          detail: versionLine(currentIdentity),
        },
        {
          icon: icon.image(),
          label: "Target",
          detail: versionLine(targetIdentity),
        },
        { icon: icon.archive(), label: "Data", detail: "preserved" },
      ]).join("\n"),
    );
  }

  // Phase 1 of 4. The rollback archive is written before anything is touched,
  // and reported as its own step: an operator who sees "Update" scroll past
  // needs to know a restore point exists without reading the source.
  const totalPhases = 4;
  const phase = (index: number, message: string) =>
    `${soft(`${index}/${totalPhases}`)}  ${message}`;
  let archive = "";
  if (interactive) {
    const step = p.spinner(spinnerStyle);
    step.start(phase(1, "Writing a rollback point"));
    try {
      archive = await backup(directory, false);
    } catch (error) {
      step.stop(phase(1, "Rollback point failed"));
      throw error;
    }
    const size = await stat(archive).then(
      (info) => humanBytes(info.size),
      () => "",
    );
    step.stop(
      `${phase(1, "Rollback point written")}  ${soft(
        [size, path.relative(directory, archive)].filter(Boolean).join(" · "),
      )}`,
    );
  } else {
    archive = await backup(directory, false);
    process.stdout.write(`${archive}\n`);
  }
  const envPath = path.join(directory, ".env");
  const configPath = path.join(directory, "harly.config.json");
  const originalEnv = await readFile(envPath, "utf8");
  const setImage = (contents: string, image: string, version: string) =>
    contents
      .replace(/^HARLY_IMAGE=.*$/m, `HARLY_IMAGE=${envLine(image)}`)
      .replace(/^HARLY_VERSION=.*$/m, `HARLY_VERSION=${envLine(version)}`);

  let migrationsAttempted = false;
  await atomicWrite(
    envPath,
    setImage(originalEnv, requestedImage, toVersion ?? "current"),
    0o600,
  );
  try {
    await pullWithProgress(
      directory,
      ["app", "migrate", "scheduler"],
      interactive,
      phase(2, "Downloading container images"),
      phase(2, "Container images downloaded"),
    );
  } catch (error) {
    await atomicWrite(envPath, originalEnv, 0o600);
    throw error;
  }

  const inspected = run(
    "docker",
    [
      "image",
      "inspect",
      requestedImage,
      "--format",
      '{{join .RepoDigests "\\n"}}',
    ],
    { allowFailure: true },
  );
  const repository = requestedImage.split("@")[0]!.replace(/:[^/:]+$/, "");
  const digest = String(inspected.stdout ?? "")
    .split(/\s+/)
    .find((value) => value.startsWith(`${repository}@sha256:`));
  const deployedImage = digest ?? requestedImage;
  // HARLY_VERSION is what the running app reports at /api/health/live and in
  // the OpenAPI document. Recording a 12-character digest fragment there made
  // every deployment look unversioned; the resolved release name is both
  // truthful and legible. `requestedImage` carries the tag the operator asked
  // for, which the digest-pinned `deployedImage` no longer shows.
  const deployedIdentity = describeImage(
    digest ? requestedImage : deployedImage,
    release,
  );
  const deployedVersion = envVersion(deployedIdentity);
  await atomicWrite(
    envPath,
    setImage(await readFile(envPath, "utf8"), deployedImage, deployedVersion),
    0o600,
  );
  const markTargetConfigured = async () => {
    config.requestedImage = requestedImage;
    config.image = deployedImage;
    config.deployedAt = new Date().toISOString();
    await atomicWrite(configPath, `${JSON.stringify(config, null, 2)}\n`);
  };

  try {
    migrationsAttempted = true;
    progressStep(
      phase(3, "Applying database migrations"),
      phase(3, "Migrations applied"),
      () => compose(directory, ["run", "--rm", "migrate"]),
    );
    progressStep(
      phase(4, "Recreating services and waiting for healthchecks"),
      phase(4, "Services are healthy"),
      () => {
        compose(directory, ["up", "-d", "--wait", "--wait-timeout", "180"]);
      },
    );
  } catch (error) {
    // A migration command may have committed before failing. Keep the target
    // image recorded in that case; rollback is a restore, not an image flip.
    if (migrationsAttempted) await markTargetConfigured();
    else await atomicWrite(envPath, originalEnv, 0o600);
    throw error;
  }
  await markTargetConfigured();
  let result = await doctor(directory, false);
  for (let attempt = 0; !result.ok && attempt < 15; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    result = await doctor(directory, false);
  }
  if (result.ok) await doctor(directory);
  if (!result.ok)
    throw new CliError(
      "Upgrade completed but health checks failed. The new image remains selected because migrations are forward-only; restore the pre-upgrade backup if recovery is required.",
    );
  if (interactive) {
    // `p.outro` prefixes only its first line with the rail; anything after a
    // newline lands flush against the left margin. Multi-line closing detail
    // therefore has to be a log message *before* the outro, not inside it.
    p.log.message(
      soft(`Rollback point: ${path.relative(directory, archive) || archive}`),
    );
    p.outro(
      `Harly is running ${accent(versionLine(deployedIdentity))} at ${accent(config.publicUrl)}`,
    );
  }
}

async function uninstall(explicitDirectory?: string) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  await readConfig(directory);
  // The confirmations above open a Clack rail; a raw write after one severs it.
  // Non-interactive runs never opened a rail, so they keep the plain sentence.
  const finish = (message: string) => {
    if (interactive) p.outro(message);
    else process.stdout.write(`${message}\n`);
  };
  if (
    !yes &&
    !(await confirm(
      "Stop Harly and remove its containers? Data volumes will be kept.",
    ))
  ) {
    throw new CliError("Uninstall cancelled.", 2);
  }
  if (flags.has("--remove-data")) {
    if (
      !yes &&
      !(await confirm(
        "Permanently delete PostgreSQL, uploads, cache, and proxy volumes?",
      ))
    ) {
      compose(directory, ["down"]);
      finish("Containers removed; data volumes kept.");
      return;
    }
    let archive = "";
    if (interactive) {
      const step = p.spinner(spinnerStyle);
      step.start("Writing a final backup before deleting data volumes");
      try {
        archive = await backup(directory, false);
      } catch (error) {
        step.stop("Final backup failed");
        throw error;
      }
      const size = await stat(archive).then(
        (info) => humanBytes(info.size),
        () => "",
      );
      step.stop(
        `Final backup written  ${soft(
          [size, path.relative(directory, archive)].filter(Boolean).join(" · "),
        )}`,
      );
    } else {
      process.stdout.write(
        "Creating a final backup before deleting data volumes.\n",
      );
      archive = await backup(directory, false);
      process.stdout.write(`${archive}\n`);
    }
    compose(directory, ["down", "--volumes"]);
    // This is the last recoverable artifact of a deployment that no longer
    // exists, so name it explicitly rather than pointing at the directory.
    if (interactive)
      p.log.warn(
        `Data volumes were deleted. The only copy left is ${accent(archive)}`,
      );
    finish(
      "Harly containers and data volumes were removed. Local backup archives were kept.",
    );
  } else {
    compose(directory, ["down"]);
    finish(
      "Harly containers were removed. PostgreSQL, uploads, and backups were kept.",
    );
  }
}

async function railwayGuide() {
  if (!json) showBrand("Railway", cliVersion);
  const token = await promptOrSecret(
    "Railway API token (from railway.app/account/tokens)",
    "--railway-token",
    "RAILWAY_TOKEN",
    "--railway-token-stdin",
  );
  const projectName = await promptOrValue("Railway project name", "--project-name", "HARLY_PROJECT_NAME", "harly");
  const email = (await promptOrValue("Initial owner email", "--email", "HARLY_INITIAL_ADMIN_EMAIL")).toLowerCase();
  if (validateEmail(email)) throw usageError("Invalid owner email.", "INVALID_CONFIGURATION");
  const bucket = await promptOrValue("S3-compatible bucket (required for cloud uploads)", "--s3-bucket", "S3_BUCKET");
  const region = await promptOrValue("S3 region", "--s3-region", "S3_REGION", "auto");
  const accessKey = await promptOrValue("S3 access key", "--s3-access-key-id", "S3_ACCESS_KEY_ID");
  const secretKey = await promptOrSecret("S3 secret key", "--s3-secret-access-key", "S3_SECRET_ACCESS_KEY", "--s3-secret-stdin");
  const requestedUrlValue = option(parsed, "--url") ?? option(parsed, "--domain");
  if (option(parsed, "--url") && !option(parsed, "--url")!.includes("://"))
    throw usageError("--url requires an origin with an HTTP(S) protocol.");
  const requestedUrl = requestedUrlValue ? normalizeUrl(requestedUrlValue, "external").origin : undefined;

  const deploymentRelease = flags.has("--dry-run") ? embeddedRelease : await officialRelease();
  const image = releaseImage(deploymentRelease);
  const runtimeSecrets = {
    betterAuth: secret(),
    aiEncryption: secret(),
    storageUpload: secret(),
    cron: secret(),
    setup: secret(),
  };
  const postgresPassword = secret();

  if (flags.has("--dry-run")) {
    writeResult(resultOk("deploy", "dry-run", {
      provider: "railway",
      projectName,
      ...(requestedUrl ? { requestedUrl } : {}),
      operations: {
        local: ["validate configuration", "resolve pinned release"],
        remote: [
          "create Railway project",
          "provision managed PostgreSQL and volume",
          "create web, scheduler and migrate services",
          "set environment variables",
          "run migrations",
          "deploy web and scheduler",
          "verify public readiness",
        ],
      },
      artifacts: flags.has("--save-env") ? [path.join(path.resolve(option(parsed, "--output-dir") ?? "harly-railway"), ".env")] : [],
      sideEffects: false,
    }));
    return;
  }

  const spin = p.spinner(spinnerStyle);
  if (interactive) spin.start("Creating Railway project");
  else humanOut("[1/7] Creating Railway project...\n");
  const { projectId, environmentId } = await railwayCreateProject(
    token,
    projectName,
  );
  recordRailwayResource("project", projectId, projectName);

  if (interactive) spin.message("Provisioning managed PostgreSQL");
  else humanOut("[2/7] Provisioning managed PostgreSQL...\n");
  const postgresServiceId = await railwayCreateService(
    token,
    projectId,
    "postgres",
    "ghcr.io/railwayapp-templates/postgres-ssl:latest",
  );
  recordRailwayResource("service", postgresServiceId, "postgres");
  await railwayCreateVolume(
    token,
    projectId,
    environmentId,
    postgresServiceId,
    "/var/lib/postgresql/data",
  );
  await railwaySetVariables(
    token,
    projectId,
    environmentId,
    postgresServiceId,
    {
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: postgresPassword,
      POSTGRES_DB: "railway",
      PGDATA: "/var/lib/postgresql/data/pgdata",
    },
  );
  const databaseUrl = `postgresql://postgres:${postgresPassword}@postgres.railway.internal:5432/railway`;

  if (interactive) spin.message("Creating web service");
  else humanOut("[3/7] Creating web service...\n");
  const webServiceId = await railwayCreateService(
    token,
    projectId,
    "web",
    image,
  );
  recordRailwayResource("service", webServiceId, "web");
  await railwayUpdateInstance(token, environmentId, webServiceId, {
    healthcheckPath: "/api/health/ready",
    restartPolicyType: "ON_FAILURE",
  });
  const domain = await railwayCreateDomain(token, environmentId, webServiceId);
  const url = normalizeUrl(`https://${domain}`, "external");

  if (interactive) spin.message("Creating scheduler service");
  else humanOut("[4/7] Creating scheduler service...\n");
  const schedulerServiceId = await railwayCreateService(
    token,
    projectId,
    "scheduler",
    image,
  );
  recordRailwayResource("service", schedulerServiceId, "scheduler");
  await railwayUpdateInstance(token, environmentId, schedulerServiceId, {
    startCommand: "node /app/runtime.mjs scheduler",
    restartPolicyType: "ON_FAILURE",
  });

  const sharedEnv = {
    HARLY_URL: url.origin,
    HARLY_INITIAL_ADMIN_EMAIL: email,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: runtimeSecrets.betterAuth,
    AI_ENCRYPTION_KEY: runtimeSecrets.aiEncryption,
    STORAGE_UPLOAD_SECRET: runtimeSecrets.storageUpload,
    CRON_SECRET: runtimeSecrets.cron,
    HARLY_SETUP_SECRET: runtimeSecrets.setup,
    DOCUSEAL_URL: "",
    DOCUSEAL_API_TOKEN: "",
    STORAGE_PROVIDER: "s3",
    S3_BUCKET: bucket,
    S3_REGION: region,
    S3_ACCESS_KEY_ID: accessKey,
    S3_SECRET_ACCESS_KEY: secretKey,
  };
  if (interactive) spin.message("Setting environment variables");
  else humanOut("[5/7] Setting environment variables...\n");
  await railwaySetVariables(
    token,
    projectId,
    environmentId,
    webServiceId,
    sharedEnv,
  );
  await railwaySetVariables(
    token,
    projectId,
    environmentId,
    schedulerServiceId,
    sharedEnv,
  );

  if (interactive) spin.message("Running database migrations");
  else humanOut("[6/7] Running database migrations...\n");
  const migrateServiceId = await railwayCreateService(
    token,
    projectId,
    "migrate",
    image,
  );
  recordRailwayResource("service", migrateServiceId, "migrate");
  await railwayUpdateInstance(token, environmentId, migrateServiceId, {
    startCommand: "node /app/runtime.mjs migrate",
    numReplicas: 0,
  });
  await railwaySetVariables(token, projectId, environmentId, migrateServiceId, {
    DATABASE_URL: databaseUrl,
  });
  await railwayDeploy(token, environmentId, migrateServiceId);

  if (interactive) spin.message("Deploying web and scheduler");
  else humanOut("[7/7] Deploying web and scheduler...\n");
  await railwayDeploy(token, environmentId, webServiceId);
  await railwayDeploy(token, environmentId, schedulerServiceId);
  if (interactive) spin.message("Waiting for public readiness");
  else humanOut("Checking public readiness...\n");
  await waitForPublicReadiness(url.origin);
  if (interactive) spin.stop("Railway project provisioned");

  const directory = path.resolve(option(parsed, "--output-dir") ?? "harly-railway");
  const env =
    Object.entries(sharedEnv)
      .map(([key, value]) => `${key}=${envLine(value)}`)
      .join("\n") + "\n";
  let savedEnvPath: string | undefined;
  if (flags.has("--save-env") && !flags.has("--dry-run")) {
    await mkdir(directory, { recursive: true });
    savedEnvPath = path.join(directory, ".env");
    if ((await exists(savedEnvPath)) && !force)
      throw usageError(`${savedEnvPath} already exists. Use --force only to replace it.`);
    await atomicWrite(savedEnvPath, env, 0o600);
    await chmod(savedEnvPath, 0o600);
    if (!json) process.stderr.write(`Warning: Railway secrets were saved locally at ${savedEnvPath} with mode 0600.\n`);
  }
  const result = resultOk("deploy", "ready", {
    provider: "railway",
    project: { id: projectId, name: projectName, environmentId },
    url: url.origin,
    ...(requestedUrl && requestedUrl !== url.origin ? { requestedUrl } : {}),
    version: versionLine(describeImage(image, deploymentRelease, () => null)),
    resources: railwayResources.map(({ type, id, name }) => ({ type, id, name })),
    ...(savedEnvPath ? { artifacts: [savedEnvPath] } : {}),
    next: [
      `Open ${url.origin}/setup to claim the owner account.`,
      "The one-shot migrate service can be deleted after it succeeds.",
      ...(requestedUrl && requestedUrl !== url.origin ? [`Attach and verify the custom domain ${requestedUrl} in Railway.`] : []),
    ],
  });
  if (json) {
    writeResult(result);
    return;
  }
  p.note(
    `Project    ${projectName} (${projectId})\nURL        ${url.origin}\nVersion    ${versionLine(describeImage(image, deploymentRelease, () => null))}\n` +
      (savedEnvPath ? `Secrets    ${savedEnvPath} (mode 0600, explicitly saved)\n` : "Secrets    not saved locally (use --save-env to opt in)\n") +
      "\nThe migrate service ran once and can be deleted from the Railway dashboard once its deployment succeeds. " +
      "Watch build/deploy logs at railway.app." + (requestedUrl && requestedUrl !== url.origin ? ` Configure ${requestedUrl} as a custom domain before using it.` : ""),
    "Railway deployment ready",
  );
  p.outro(`Harly is ready at ${accent(url.origin)}.`);
}

async function cloudGuide(provider: "fly" | "digitalocean") {
  const providerName = provider === "fly" ? "Fly.io" : "DigitalOcean";
  if (!json) showBrand(providerName, cliVersion);
  const suppliedUrl = option(parsed, "--url") ?? option(parsed, "--domain") ?? process.env.HARLY_URL;
  if (!suppliedUrl) throw usageError("--url, --domain or HARLY_URL is required.", "MISSING_ARGUMENT");
  if (option(parsed, "--url") && !option(parsed, "--url")!.includes("://"))
    throw usageError("--url requires an origin with an HTTP(S) protocol.");
  const url = normalizeUrl(suppliedUrl, "external");
  const email = (await promptOrValue("Initial owner email", "--email", "HARLY_INITIAL_ADMIN_EMAIL")).toLowerCase();
  if (validateEmail(email)) throw usageError("Invalid owner email.", "INVALID_CONFIGURATION");
  const bucket = await promptOrValue("S3-compatible bucket (required for cloud uploads)", "--s3-bucket", "S3_BUCKET");
  const region = await promptOrValue("S3 region", "--s3-region", "S3_REGION", "auto");
  const accessKey = await promptOrValue("S3 access key", "--s3-access-key-id", "S3_ACCESS_KEY_ID");
  const secretKey = await promptOrSecret("S3 secret key", "--s3-secret-access-key", "S3_SECRET_ACCESS_KEY", "--s3-secret-stdin");
  const databaseUrl =
    provider === "digitalocean"
      // Interactive label retained as the canonical operator-facing wording:
      // message: "DigitalOcean Managed PostgreSQL connection URL"
      // Legacy validation contract: validate: validateDatabaseUrl
      ? await promptOrValue("DigitalOcean Managed PostgreSQL connection URL", "--database-url", "DATABASE_URL")
        : undefined;
  const directory = path.resolve(option(parsed, "--output-dir") ?? `harly-${provider}`);
  // Keep .env and any generated provider spec consistent. This also gives an
  // operator one recoverable local record of the exact runtime secrets.
  const runtimeSecrets = {
    betterAuth: secret(),
    aiEncryption: secret(),
    storageUpload: secret(),
    cron: secret(),
    setup: secret(),
  };
  const env =
    [
      `HARLY_URL=${envLine(url.origin)}`,
      `HARLY_INITIAL_ADMIN_EMAIL=${envLine(email)}`,
      `BETTER_AUTH_SECRET=${envLine(runtimeSecrets.betterAuth)}`,
      `AI_ENCRYPTION_KEY=${envLine(runtimeSecrets.aiEncryption)}`,
      `STORAGE_UPLOAD_SECRET=${envLine(runtimeSecrets.storageUpload)}`,
      `CRON_SECRET=${envLine(runtimeSecrets.cron)}`,
      `HARLY_SETUP_SECRET=${envLine(runtimeSecrets.setup)}`,
      "DOCUSEAL_URL=",
      "DOCUSEAL_API_TOKEN=",
      'STORAGE_PROVIDER="s3"',
      `S3_BUCKET=${envLine(bucket)}`,
      `S3_REGION=${envLine(region)}`,
      `S3_ACCESS_KEY_ID=${envLine(accessKey)}`,
      `S3_SECRET_ACCESS_KEY=${envLine(secretKey)}`,
      ...(databaseUrl ? [`DATABASE_URL=${envLine(databaseUrl)}`] : []),
    ].join("\n") + "\n";
  const saveEnv = flags.has("--save-env");
  if (saveEnv && !flags.has("--dry-run")) {
    await mkdir(directory, { recursive: true });
    const envPath = path.join(directory, ".env");
    if ((await exists(envPath)) && !force) throw usageError(`${envPath} already exists. Use --force to replace it.`);
    await atomicWrite(envPath, env, 0o600);
    await chmod(envPath, 0o600);
  }

  const deploymentRelease = flags.has("--dry-run") ? embeddedRelease : await officialRelease();
  const image = releaseImage(deploymentRelease);
  if (provider === "fly") {
    if (!flags.has("--dry-run")) await mkdir(directory, { recursive: true });
    if (!flags.has("--dry-run")) await atomicWrite(
      path.join(directory, "fly.toml"),
      `app = "replace-with-your-harly-app-name"
primary_region = "iad"

[build]
  image = "${image}"

[processes]
  web = "serve"
  scheduler = "scheduler"

[deploy]
  release_command = "migrate"

[http_service]
  processes = ["web"]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

[[http_service.checks]]
  grace_period = "20s"
  interval = "30s"
  timeout = "5s"
  method = "GET"
  path = "/api/health/ready"
`,
    );
  }
  if (provider === "digitalocean") {
    const yaml = (value: string) => JSON.stringify(value);
    const secretEnv = (key: string, value: string) =>
      `  - { key: ${key}, scope: RUN_TIME, type: SECRET, value: ${yaml(saveEnv ? value : "<set-in-provider-dashboard>")} }`;
    const publicEnv = (key: string, value: string) =>
      `  - { key: ${key}, scope: RUN_TIME, type: GENERAL, value: ${yaml(value)} }`;
    const appSpec = [
      "# Generated by the Harly CLI. This file contains secrets: keep it outside Git.",
      "name: harly",
      "region: nyc",
      "",
      "envs:",
      secretEnv("DATABASE_URL", databaseUrl!),
      publicEnv("HARLY_URL", url.origin),
      publicEnv("HARLY_INITIAL_ADMIN_EMAIL", email),
      publicEnv("STORAGE_PROVIDER", "s3"),
      publicEnv("S3_BUCKET", bucket),
      publicEnv("S3_REGION", region),
      publicEnv("DOCUSEAL_URL", ""),
      secretEnv("DOCUSEAL_API_TOKEN", ""),
      secretEnv("S3_ACCESS_KEY_ID", accessKey),
      secretEnv("S3_SECRET_ACCESS_KEY", secretKey),
      secretEnv("BETTER_AUTH_SECRET", runtimeSecrets.betterAuth),
      secretEnv("AI_ENCRYPTION_KEY", runtimeSecrets.aiEncryption),
      secretEnv("STORAGE_UPLOAD_SECRET", runtimeSecrets.storageUpload),
      secretEnv("CRON_SECRET", runtimeSecrets.cron),
      secretEnv("HARLY_SETUP_SECRET", runtimeSecrets.setup),
      `services:`,
      "  - name: web",
      `    image: { registry_type: GHCR, registry: vytral, repository: harly, tag: ${deploymentRelease.version} }`,
      "    run_command: node /app/runtime.mjs serve",
      "    http_port: 3000",
      "    instance_count: 1",
      "    instance_size_slug: apps-s-1vcpu-1gb",
      "    health_check: { http_path: /api/health/ready, port: 3000, initial_delay_seconds: 20, period_seconds: 30, timeout_seconds: 5, failure_threshold: 5 }",
      "workers:",
      "  - name: scheduler",
      `    image: { registry_type: GHCR, registry: vytral, repository: harly, tag: ${deploymentRelease.version} }`,
      "    run_command: node /app/runtime.mjs scheduler",
      "    instance_count: 1",
      "    instance_size_slug: apps-s-1vcpu-0.5gb",
      "jobs:",
      "  - name: migrate",
      "    kind: PRE_DEPLOY",
      `    image: { registry_type: GHCR, registry: vytral, repository: harly, tag: ${deploymentRelease.version} }`,
      "    run_command: node /app/runtime.mjs migrate",
      "    instance_size_slug: apps-s-1vcpu-0.5gb",
      "",
    ].join("\n");
    if (!flags.has("--dry-run")) await atomicWrite(path.join(directory, "app.yaml"), appSpec, 0o600);
  }
  const next =
    provider === "fly"
      ? `Run \`fly launch --no-deploy\` in ${shellQuote(directory)}, attach Managed Postgres, import .env as Fly secrets, then run \`fly deploy\`.`
      : `The generated app spec already includes your Managed PostgreSQL URL as an encrypted app-level secret. Deploy with \`doctl apps create --spec ${shellQuote(path.join(directory, "app.yaml"))}\`.`;
  const artifacts = [path.join(directory, provider === "fly" ? "fly.toml" : "app.yaml"), ...(saveEnv ? [path.join(directory, ".env")] : [])];
  const result = resultOk("deploy", "ready-to-deploy", {
    provider,
    url: url.origin,
    version: versionLine(describeImage(image, deploymentRelease, () => null)),
    artifacts,
    pending: [next],
    ...(saveEnv ? {} : { note: "Secrets were not saved locally. Use --save-env to opt in." }),
  });
  if (json) {
    writeResult(result);
    return;
  }
  p.note(
    `Version   ${versionLine(describeImage(image, deploymentRelease, () => null))}\n${saveEnv ? `Secrets   ${path.join(directory, ".env")} (mode 0600, explicitly saved)` : "Secrets   not saved locally (use --save-env to opt in)"}${provider === "digitalocean" ? `\nApp spec  ${path.join(directory, "app.yaml")} (mode 0600)` : ""}\nStorage   S3 required\n\n${next}`,
    "Cloud deployment prepared",
  );
  p.outro("Configuration ready to deploy. Never commit generated secret files.");
}

async function menu() {
  const installation = await findInstallation();
  if (!interactive) {
    if (installation) return doctor(installation.directory);
    usage();
    return;
  }
  showBrand(undefined, cliVersion);
  if (!installation) {
    const choice = unwrapPrompt(
      await p.select({
        message: "What would you like to do?",
        options: [
          {
            value: "install",
            label: "Install Harly on this server",
            hint: "Docker + automatic HTTPS",
          },
          {
            value: "cloud",
            label: "Deploy to a managed cloud",
            hint: "Railway · Fly.io · DigitalOcean",
          },
          { value: "help", label: "Show advanced commands" },
        ],
      }),
    );
    if (choice === "install") return init();
    if (choice === "cloud") return cloudSubmenu();
    usage();
    return;
  }
  const identity = describeImage(
    installation.config.requestedImage ?? installation.config.image,
    await officialRelease(),
  );
  p.log.message(
    rows([
      {
        icon: icon.network(),
        label: "URL",
        detail: installation.config.publicUrl,
      },
      {
        icon: icon.image(),
        label: "Version",
        detail: versionLine(identity),
      },
      {
        icon: icon.config(),
        label: "Directory",
        detail: installation.directory,
      },
    ]).join("\n"),
  );
  const choice = unwrapPrompt(
    await p.select({
      message: "Choose an action",
      options: [
        { value: "status", label: "Status" },
        { value: "update", label: "Update Harly" },
        { value: "backup", label: "Create backup" },
        { value: "restore", label: "Restore backup" },
        { value: "uninstall", label: "Stop or uninstall Harly" },
      ],
    }),
  );
  if (choice === "status") return doctor(installation.directory);
  if (choice === "update") return upgrade(installation.directory);
  if (choice === "backup")
    return backup(installation.directory).then(() => undefined);
  if (choice === "restore") {
    p.log.info(
      "Use `harly restore <archive> --force` for restore. Local rollback archives work without extra dependencies; encrypted `.age` archives are an advanced option.",
    );
    return;
  }
  return uninstall(installation.directory);
}

async function cloudSubmenu() {
  p.note(
    [
      "Harly also runs on managed platforms, but the experience is the same:",
      "Docker, a managed PostgreSQL database, S3 for uploads, and a setup secret.",
      "Render and DigitalOcean have one-click deploy buttons from the README;",
      "the CLI writes the spec and secrets for the platforms below.",
      "",
      "See docs/cloud-deployments.md for the full guide.",
    ].join("\n"),
    "Managed cloud",
  );
  const choice = unwrapPrompt(
    await p.select({
      message: "Pick a platform",
      options: [
        { value: "railway", label: "Railway" },
        { value: "fly", label: "Fly.io" },
        { value: "digitalocean", label: "DigitalOcean App Platform" },
        { value: "back", label: "Back" },
      ],
    }),
  );
  if (p.isCancel(choice) || choice === "back") return;
  if (choice === "railway") return railwayGuide();
  return cloudGuide(choice as "fly" | "digitalocean");
}

async function deploy(provider?: string) {
  const choice = provider ?? positionals[0];
  switch (choice) {
    case "railway":
      return railwayGuide();
    case "fly":
      return cloudGuide("fly");
    case "digitalocean":
    case "do":
      return cloudGuide("digitalocean");
    default:
      throw new CliError(
        `harly deploy needs one of: railway, fly, digitalocean. Got: ${choice ?? "(none)"}.`,
        2,
      );
  }
}

async function main() {
  if (parseError) {
    throw usageError(parseError instanceof Error ? parseError.message : String(parseError));
  }
  switch (command) {
    case "menu":
      return menu();
    case "check":
      return harlyCheck();
    case "init":
      return init();
    case "launch":
      return launch();
    case "doctor":
      return doctor();
    case "setup-secret":
      return setupSecret();
    case "backup":
      return backup();
    case "restore":
      return restore();
    case "upgrade":
    case "update":
      return upgrade();
    case "uninstall":
      return uninstall();
    case "deploy":
      return deploy();
    case "help":
    case "--help":
    case "-h":
      if (json) writeResult(resultOk("help", "completed", { commands: commandHelp.map(([name, description]) => ({ name, description })) }));
      else usage();
      return;
    case "--version":
    case "-v":
      if (json) writeResult(resultOk("version", "completed", { version: cliVersion }));
      else process.stdout.write(`${cliVersion}\n`);
      return;
    default:
      usage();
      throw new CliError(`Unknown command: ${command}`, 2);
  }
}

process.once("SIGINT", () => {
  if (json) writeResult(resultError(command, "cancelled", "CANCELLED", "Operation cancelled."));
  else process.stderr.write("Operation cancelled.\n");
  process.exit(130);
});

main().then(() => {
  if (json && !jsonResultWritten) writeResult(resultOk(command, "completed"));
}).catch(async (error) => {
  const result = await handleHarlyError(error, { interactive, yes });
  if (result.kind === "abort") {
    const exitCode = result.exitCode;
    if (json && !jsonResultWritten) {
      const message = error instanceof Error && error.message ? error.message : "Operation failed.";
      const cancelled = error instanceof CliError && error.code === "CANCELLED";
      const code = cancelled ? "CANCELLED" : stableErrorCode(error);
      writeResult(resultError(command, cancelled ? "cancelled" : "failed", code, message, railwayResources.length > 0 && command === "deploy" ? {
        resourcesCreated: railwayResources,
        recovery: {
          automaticRollback: false,
          actions: [
            "Inspect the partially provisioned project in Railway.",
            "Do not rerun until existing resources have been reviewed.",
            "Delete unused resources manually if the deployment is abandoned.",
          ],
        },
      } : {}));
    }
    process.exit(exitCode);
  }
});
