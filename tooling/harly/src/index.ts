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
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import * as p from "@clack/prompts";
import pc from "picocolors";
import { embeddedRelease, releaseImage, type HarlyRelease } from "./release.js";
import { pullWithProgress } from "./pull.js";
import { accent, accentBadge, ink, showBrand, soft, spinnerStyle } from "./theme.js";

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
  const memoryGb = os.totalmem() / 1024 ** 3;
  if (memoryGb < 3.5) return "compact";
  if (memoryGb < 7.5) return "standard";
  return "performance";
}

class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: 1 | 2 = 1,
  ) {
    super(message);
  }
}

const args = process.argv.slice(2);
const command = args.shift() ?? "menu";
const flags = new Set(
  args.filter((arg) => arg.startsWith("--") && !["--to"].includes(arg)),
);
const positionals = args.filter(
  (arg, index) => !arg.startsWith("--") && args[index - 1] !== "--to",
);
const toIndex = args.indexOf("--to");
const toVersion = toIndex >= 0 ? args[toIndex + 1] : undefined;
const force = flags.has("--force");
const yes = flags.has("--yes");
const json = flags.has("--json");
// CI and automated recovery checks must never wait for a terminal prompt,
// even when their runner allocates a pseudo-TTY.
const interactive = Boolean(
  process.stdin.isTTY && process.stdout.isTTY && !process.env.CI,
);
const cliVersion = "0.2.4";
const releaseManifestUrl =
  process.env.HARLY_RELEASE_MANIFEST_URL ??
  "https://raw.githubusercontent.com/Vytral/harly/main/release-manifest.json";
let currentOfficialRelease: HarlyRelease | undefined;
let releaseManifestChecked = false;

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
  ["harly init [directory] [--force]", "Generate a new installation"],
  ["harly launch [directory] [--yes]", "Pull images and start the services"],
  ["harly doctor [directory] [--json]", "Check services and public readiness"],
  ["harly backup [directory] [--encrypt]", "Write a private rollback archive"],
  ["harly restore <archive> [directory] --force", "Restore from an archive"],
  ["harly update [directory] [--to version]", "Back up, upgrade, and migrate"],
  ["harly uninstall [directory] [--remove-data]", "Stop and remove Harly"],
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
  throw new CliError("", 2);
}

function run(
  program: string,
  commandArgs: string[],
  options: {
    cwd?: string;
    input?: Buffer;
    binary?: boolean;
    allowFailure?: boolean;
  } = {},
) {
  const result = spawnSync(program, commandArgs, {
    cwd: options.cwd,
    input: options.input,
    // Database dumps are binary. Never decode them as UTF-8 on the way out
    // of Docker, otherwise pg_restore receives a silently corrupted archive.
    encoding: options.input || options.binary ? undefined : "utf8",
    stdio: options.input || options.binary ? ["pipe", "pipe", "pipe"] : "pipe",
    maxBuffer: 1024 * 1024 * 512,
  });
  if (result.status !== 0 && !options.allowFailure) {
    const message = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : result.stderr;
    throw new CliError(
      `${program} ${commandArgs.join(" ")} failed${message ? `: ${message.trim()}` : "."}`,
    );
  }
  return result;
}

function compose(
  cwd: string,
  composeArgs: string[],
  options: { input?: Buffer; binary?: boolean; allowFailure?: boolean } = {},
) {
  return run("docker", ["compose", ...composeArgs], { cwd, ...options });
}

function parseVersion(value: string): number[] {
  return (value.match(/\d+(?:\.\d+)+/)?.[0] ?? "0").split(".").map(Number);
}

function atLeast(actual: number[], expected: number[]): boolean {
  return expected.every((part, index) =>
    (actual[index] ?? 0) === part
      ? true
      : (actual[index] ?? 0) > part
        ? true
        : expected.slice(0, index).every((item, i) => item === (actual[i] ?? 0))
          ? false
          : true,
  );
}

async function portAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      // Docker can publish privileged ports even when this unprivileged Node
      // process cannot bind them directly. EADDRINUSE is the conflict signal.
      resolve(error.code === "EACCES");
    });
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
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

async function preflight(
  mode?: ProxyMode,
  checkPorts = true,
  requestedPort?: number,
  directory = process.cwd(),
) {
  if (!atLeast(parseVersion(process.versions.node), [20, 12, 0]))
    throw new CliError("Node.js 20.12 or newer is required.");
  const docker = run("docker", ["version", "--format", "{{.Server.Version}}"], {
    allowFailure: true,
  });
  if (
    docker.status !== 0 ||
    !atLeast(parseVersion(String(docker.stdout)), [24, 0, 0])
  )
    throw new CliError(
      "Docker Engine 24 or newer is required and must be running.",
    );
  const plugin = run("docker", ["compose", "version", "--short"], {
    allowFailure: true,
  });
  if (
    plugin.status !== 0 ||
    !atLeast(parseVersion(String(plugin.stdout)), [2, 20, 0])
  )
    throw new CliError("Docker Compose 2.20 or newer is required.");
  if (checkPorts) {
    const ports =
      mode === "caddy"
        ? [80, 443]
        : [requestedPort ?? Number(process.env.HARLY_PORT ?? 3000)];
    for (const port of ports)
      if (!(await portAvailable(port)))
        throw new CliError(`Port ${port} is already in use.`);
  }
  const diskGb = await freeDiskGb(directory);
  if (diskGb < 5)
    throw new CliError(
      `At least 5 GB of free disk is required (${diskGb.toFixed(1)} GB available).`,
    );
  return {
    cpuCount: os.cpus().length,
    memoryGb: os.totalmem() / 1024 ** 3,
    diskGb,
  };
}

function requiredEnvironment(name: string, value?: string): string {
  if (value?.trim()) return value.trim();
  throw new CliError(`${name} is required in non-interactive mode.`, 2);
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
  return url;
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
  const mode = (process.env.HARLY_PROXY_MODE ?? "caddy") as ProxyMode;
  if (!["caddy", "external", "local"].includes(mode))
    throw new CliError("Invalid proxy mode.", 2);
  const url = normalizeUrl(
    requiredEnvironment("HARLY_URL", process.env.HARLY_URL),
    mode,
  );
  const requestedPort = Number(
    process.env.HARLY_PORT ?? (mode === "local" && url.port ? url.port : 3000),
  );
  await preflight(mode, true, requestedPort, directory);
  if (mode !== "local") await dns.lookup(url.hostname);
  const email = requiredEnvironment(
    "HARLY_INITIAL_ADMIN_EMAIL",
    process.env.HARLY_INITIAL_ADMIN_EMAIL,
  ).toLowerCase();
  if (validateEmail(email)) throw new CliError("Invalid owner email.", 2);
  const organization =
    process.env.HARLY_ORGANIZATION?.trim() || "My organization";
  const storage = (process.env.STORAGE_PROVIDER ?? "local") as "local" | "s3";
  if (!["local", "s3"].includes(storage))
    throw new CliError("Invalid storage provider.", 2);
  const resourceProfile = (process.env.HARLY_RESOURCE_PROFILE ??
    detectResourceProfile()) as ResourceProfile;
  if (!Object.hasOwn(resourceProfiles, resourceProfile))
    throw new CliError("Invalid resource profile.", 2);
  const s3 =
    storage === "s3"
      ? {
          bucket: requiredEnvironment("S3_BUCKET", process.env.S3_BUCKET),
          region: process.env.S3_REGION?.trim() || "auto",
          accessKeyId: requiredEnvironment(
            "S3_ACCESS_KEY_ID",
            process.env.S3_ACCESS_KEY_ID,
          ),
          secretAccessKey: requiredEnvironment(
            "S3_SECRET_ACCESS_KEY",
            process.env.S3_SECRET_ACCESS_KEY,
          ),
          endpoint: process.env.S3_ENDPOINT?.trim() || "",
          publicUrl: process.env.S3_PUBLIC_URL?.trim() || "",
        }
      : null;
  const image =
    process.env.HARLY_IMAGE_REF ?? releaseImage(await officialRelease());
  if (image.endsWith(":latest"))
    throw new CliError(
      "Installations must pin a version or digest, never latest.",
      2,
    );
  return {
    mode,
    url,
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
  showBrand("Install", cliVersion);
  p.intro(accentBadge(" Welcome to Harly "));

  const publicOrigin = unwrapPrompt(
    await p.text({
      message: "Public domain or URL",
      placeholder: "harly.example.com",
      initialValue: process.env.HARLY_URL,
      validate: validatePublicOrigin,
    }),
  );
  const mode = unwrapPrompt(
    await p.select<ProxyMode>({
      message: "Reverse proxy",
      initialValue:
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
  const url = normalizeUrl(publicOrigin, mode);

  const preflightSpinner = p.spinner(spinnerStyle);
  preflightSpinner.start("Checking Docker, ports, and DNS");
  let host: Awaited<ReturnType<typeof preflight>>;
  try {
    const requestedPort = Number(
      process.env.HARLY_PORT ??
        (mode === "local" && url.port ? url.port : 3000),
    );
    host = await preflight(mode, true, requestedPort, directory);
    if (mode !== "local") await dns.lookup(url.hostname);
    preflightSpinner.stop("Host preflight passed");
  } catch (error) {
    preflightSpinner.stop("Host preflight failed");
    throw error;
  }

  const email = unwrapPrompt(
    await p.text({
      message: "Initial owner email",
      placeholder: "owner@example.com",
      initialValue: process.env.HARLY_INITIAL_ADMIN_EMAIL,
      validate: validateEmail,
    }),
  ).toLowerCase();
  const organization = unwrapPrompt(
    await p.text({
      message: "Organization name",
      placeholder: "Acme Inc.",
      initialValue: process.env.HARLY_ORGANIZATION ?? "My organization",
      validate: (value) =>
        value?.trim() ? undefined : "Enter an organization name.",
    }),
  );
  const storage = unwrapPrompt(
    await p.select<"local" | "s3">({
      message: "File storage",
      initialValue:
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
              initialValue: process.env.S3_BUCKET,
              validate: (value) =>
                value?.trim() ? undefined : "Enter the bucket name.",
            }),
          ),
          region: unwrapPrompt(
            await p.text({
              message: "S3 region",
              initialValue: process.env.S3_REGION ?? "auto",
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
              initialValue: process.env.S3_ENDPOINT ?? "",
            }),
          ),
          publicUrl: unwrapPrompt(
            await p.text({
              message: "S3 public URL",
              placeholder: "Optional",
              initialValue: process.env.S3_PUBLIC_URL ?? "",
            }),
          ),
        }
      : null;

  const detectedProfile = detectResourceProfile();
  p.note(hostSummary(host), `Detected host · ${detectedProfile}`);
  const resourceProfile = unwrapPrompt(
    await p.select<ResourceProfile>({
      message: "Resource profile",
      initialValue:
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
    process.env.HARLY_IMAGE_REF ?? releaseImage(await officialRelease());
  if (image.endsWith(":latest"))
    throw new CliError(
      "Installations must pin a version or digest, never latest.",
      2,
    );
  const services = `PostgreSQL, migrator, app, scheduler${mode === "caddy" ? ", Caddy" : ""}`;
  const localPort =
    process.env.HARLY_PORT ??
    (mode === "local" && url.port ? url.port : "3000");
  p.note(
    [
      `Directory   ${directory}`,
      `URL         ${url.origin}`,
      `Image       ${image}`,
      `Services    ${services}`,
      `Ports       ${mode === "caddy" ? "80, 443" : `127.0.0.1:${localPort}`}`,
      `Storage     ${storage === "local" ? "Local persistent volume" : "S3-compatible"}`,
      `Resources   ${resourceProfile}`,
      `HTTPS       ${mode === "caddy" ? "Managed automatically by Caddy" : mode === "external" ? "Managed by external proxy" : "Disabled"}`,
    ].join("\n"),
    "Installation plan",
  );

  const approved = unwrapPrompt(
    await p.confirm({
      message: "Generate this installation?",
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
    environment: { HARLY_DOMAIN: "\${HARLY_DOMAIN:-localhost}" }
    ports: ["80:80", "443:443", "443:443/udp"]
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile:ro", caddy-data:/data, caddy-config:/config]
    depends_on: { app: { condition: service_healthy } }
volumes: { postgres-data: {}, uploads: {}, next-cache: {}, caddy-data: {}, caddy-config: {} }
`;

const envExample = `HARLY_IMAGE=ghcr.io/vytral/harly:<version-or-digest>\nHARLY_VERSION=<version>\nHARLY_URL=https://harly.example.com\nHARLY_PORT=3000\nHARLY_DOMAIN=harly.example.com\nCOMPOSE_PROFILES=proxy\nPOSTGRES_USER=harly\nPOSTGRES_PASSWORD=<secret>\nPOSTGRES_DB=harly\nBETTER_AUTH_SECRET=<secret>\nAI_ENCRYPTION_KEY=<secret>\nSTORAGE_UPLOAD_SECRET=<secret>\nCRON_SECRET=<secret>\nHARLY_SETUP_SECRET=<secret>\nHARLY_INITIAL_ADMIN_EMAIL=owner@example.com\nSTORAGE_PROVIDER=local\nRESEND_API_KEY=\nEMAIL_FROM=\n# Optional resource tuning (defaults target a 4 GB VPS)\nHARLY_APP_MEMORY=1536m\nHARLY_POSTGRES_MEMORY=768m\nHARLY_SCHEDULER_MEMORY=256m\nHARLY_SCHEDULER_STALE_AFTER_SECONDS=300\nHARLY_CADDY_MEMORY=256m\nHARLY_CACHE_MAX_MB=512\nHARLY_CACHE_MAX_AGE_DAYS=7\nHARLY_LOG_MAX_SIZE=10m\nHARLY_LOG_MAX_FILES=3\n`;
const envExampleWithEsign = `${envExample}# Optional DocuSeal global fallback (per-workspace config in Settings overrides)\nDOCUSEAL_URL=\nDOCUSEAL_API_TOKEN=\n# Set only when running the bundled DocuSeal service (--profile esign)\nDOCUSEAL_SECRET_KEY_BASE=\n`;

async function init() {
  const directory = path.resolve(positionals[0] ?? "harly");
  const answers = interactive
    ? await collectInteractiveAnswers(directory)
    : await collectNonInteractiveAnswers(directory);
  const {
    mode,
    url,
    email,
    organization,
    storage,
    s3,
    resourceProfile,
    image,
  } = answers;
  const resources = resourceProfiles[resourceProfile];
  const generationSpinner = interactive ? p.spinner(spinnerStyle) : null;
  generationSpinner?.start("Generating secure configuration");
  try {
    await mkdir(directory, { recursive: true });

    const envPath = path.join(directory, ".env");
    if (!(await exists(envPath))) {
      const env = [
        `HARLY_IMAGE=${envLine(image)}`,
        `HARLY_VERSION=${envLine(image.includes("@sha256:") ? "digest" : (image.split(":").at(-1) ?? "unknown"))}`,
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
      await atomicWrite(envPath, env, 0o600);
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
        `# Harly self-host\n\n- Open management: \`npx @harly/cli\`\n- Diagnose: \`npx @harly/cli doctor\`\n- Backup before every update.\n- Complete the first owner at ${url.origin}/setup using HARLY_SETUP_SECRET from .env.\n`,
      ],
    ];
    for (const [name, contents, modeBits] of templates) {
      const target = path.join(directory, name);
      if (!(await exists(target)) || force)
        await atomicWrite(target, contents, modeBits);
    }
  } catch (error) {
    generationSpinner?.stop("Configuration generation failed");
    throw error;
  }
  generationSpinner?.stop("Configuration generated");

  if (interactive) {
    p.log.success(`${pc.bold(directory)} is ready`);
    const launchNow = unwrapPrompt(
      await p.confirm({
        message: "Pull the image and launch Harly now?",
        initialValue: true,
      }),
    );
    if (launchNow) {
      await launch(directory, true);
      p.outro(
        `Harly is ready at ${accent(url.origin)} · run ${accent("npx @harly/cli")}`,
      );
    } else {
      p.outro(
        `Next: ${accent(`cd ${shellQuote(directory)} && npx @harly/cli`)}`,
      );
    }
  } else {
    process.stdout.write(
      `\nGenerated ${directory}\nImage: ${image}\nMode: ${mode}\nResource profile: ${resourceProfile}\nServices: postgres, migrate, app, scheduler${mode === "caddy" ? ", caddy" : ""}\nVolumes: postgres-data, uploads, next-cache${mode === "caddy" ? ", caddy-data, caddy-config" : ""}\n\n`,
    );
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

async function launch(explicitDirectory?: string, confirmed = false) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  if (interactive && !confirmed) {
    showBrand("Launch", cliVersion);
    p.intro(accentBadge(" Launch Harly "));
    p.note(
      `Image  ${config.image}\nMode   ${config.proxyMode}\nURL    ${config.publicUrl}`,
      "Launch plan",
    );
  } else if (!interactive) {
    process.stdout.write(
      `Image: ${config.image}\nMode: ${config.proxyMode}\nCommands: docker compose pull; docker compose up -d --wait\n`,
    );
  }
  if (!confirmed && !yes && !(await confirm("Continue?"))) {
    if (!process.stdin.isTTY)
      throw new CliError("--yes is required in non-interactive mode.", 2);
    throw new CliError("Launch cancelled.", 2);
  }
  progressStep(
    "Validating Docker Compose",
    "Compose configuration is valid",
    () => compose(directory, ["config", "--quiet"]),
  );
  await pullWithProgress(directory, [], interactive);
  progressStep(
    "Starting Harly and waiting for healthchecks",
    "Harly services are healthy",
    () => {
      compose(directory, ["up", "-d", "--wait", "--wait-timeout", "180"]);
    },
  );
  if (interactive && !confirmed) {
    p.outro(
      `Harly is ready at ${accent(config.publicUrl)} · run ${accent("npx @harly/cli doctor .")}`,
    );
  } else if (!interactive) {
    process.stdout.write(
      `Harly is ready at ${config.publicUrl}. Run doctor to verify the public route.\n`,
    );
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
  if (print)
    process.stdout.write(
      json
        ? `${JSON.stringify(result)}\n`
        : `\n${checks
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
  if (!result.ok && print) process.exitCode = 1;
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

async function backup(explicitDirectory?: string): Promise<string> {
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
      process.stdout.write(`${archive}\n`);
      return archive;
    }
    const encrypted = `${archive}.age`;
    run("age", ["-r", recipient!, "-o", encrypted, archive]);
    await chmod(encrypted, 0o600);
    await rm(archive, { force: true });
    process.stdout.write(`${encrypted}\n`);
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
  if (
    !yes &&
    !(await confirm(
      `Back up and upgrade ${config.image} to ${requestedImage}?`,
    ))
  ) {
    if (!interactive)
      throw new CliError("--yes is required in non-interactive mode.", 2);
    throw new CliError("Upgrade cancelled.", 2);
  }

  if (interactive) {
    showBrand("Update", cliVersion);
    p.intro(accentBadge(" Upgrade Harly "));
    p.note(
      `Current  ${config.image}\nTarget   ${requestedImage}\nData     preserved`,
      "Upgrade plan",
    );
  }

  await backup(directory);
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
  const deployedVersion = deployedImage.includes("@sha256:")
    ? deployedImage.split("@sha256:")[1]!.slice(0, 12)
    : (toVersion ?? "current");
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
    progressStep("Applying database migrations", "Migrations applied", () =>
      compose(directory, ["run", "--rm", "migrate"]),
    );
    progressStep(
      "Recreating services and waiting for healthchecks",
      "Services are healthy",
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
  if (interactive)
    p.outro(
      `Harly is running ${accent(deployedImage)} at ${accent(config.publicUrl)}`,
    );
}

async function uninstall(explicitDirectory?: string) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  await readConfig(directory);
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
      process.stdout.write("Containers removed; data volumes kept.\n");
      return;
    }
    process.stdout.write(
      "Creating a final backup before deleting data volumes.\n",
    );
    await backup(directory);
    compose(directory, ["down", "--volumes"]);
    process.stdout.write(
      "Harly containers and data volumes were removed. Local backup archives were kept.\n",
    );
  } else {
    compose(directory, ["down"]);
    process.stdout.write(
      "Harly containers were removed. PostgreSQL, uploads, and backups were kept.\n",
    );
  }
}

async function railwayGuide() {
  showBrand("Railway", cliVersion);
  p.intro(accentBadge(" Deploy Harly on Railway "));
  const token = unwrapPrompt(
    await p.password({
      message: "Railway API token (from railway.app/account/tokens)",
      validate: (value) => (value?.trim() ? undefined : "Required."),
    }),
  );
  const projectName = unwrapPrompt(
    await p.text({ message: "Railway project name", initialValue: "harly" }),
  );
  const email = unwrapPrompt(
    await p.text({ message: "Initial owner email", validate: validateEmail }),
  ).toLowerCase();
  const bucket = unwrapPrompt(
    await p.text({
      message: "S3-compatible bucket (required for cloud uploads)",
      validate: (value) =>
        value?.trim()
          ? undefined
          : "S3 storage is required on cloud platforms.",
    }),
  );
  const region = unwrapPrompt(
    await p.text({ message: "S3 region", initialValue: "auto" }),
  );
  const accessKey = unwrapPrompt(
    await p.password({
      message: "S3 access key",
      validate: (value) => (value ? undefined : "Required."),
    }),
  );
  const secretKey = unwrapPrompt(
    await p.password({
      message: "S3 secret key",
      validate: (value) => (value ? undefined : "Required."),
    }),
  );

  const deploymentRelease = await officialRelease();
  const image = releaseImage(deploymentRelease);
  const runtimeSecrets = {
    betterAuth: secret(),
    aiEncryption: secret(),
    storageUpload: secret(),
    cron: secret(),
    setup: secret(),
  };
  const postgresPassword = secret();

  const spin = p.spinner(spinnerStyle);
  spin.start("Creating Railway project");
  const { projectId, environmentId } = await railwayCreateProject(
    token,
    projectName,
  );

  spin.message("Provisioning managed PostgreSQL");
  const postgresServiceId = await railwayCreateService(
    token,
    projectId,
    "postgres",
    "ghcr.io/railwayapp-templates/postgres-ssl:latest",
  );
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

  spin.message("Creating web service");
  const webServiceId = await railwayCreateService(
    token,
    projectId,
    "web",
    image,
  );
  await railwayUpdateInstance(token, environmentId, webServiceId, {
    healthcheckPath: "/api/health/ready",
    restartPolicyType: "ON_FAILURE",
  });
  const domain = await railwayCreateDomain(token, environmentId, webServiceId);
  const url = normalizeUrl(`https://${domain}`, "external");

  spin.message("Creating scheduler service");
  const schedulerServiceId = await railwayCreateService(
    token,
    projectId,
    "scheduler",
    image,
  );
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
  spin.message("Setting environment variables");
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

  spin.message("Running database migrations");
  const migrateServiceId = await railwayCreateService(
    token,
    projectId,
    "migrate",
    image,
  );
  await railwayUpdateInstance(token, environmentId, migrateServiceId, {
    startCommand: "node /app/runtime.mjs migrate",
    numReplicas: 0,
  });
  await railwaySetVariables(token, projectId, environmentId, migrateServiceId, {
    DATABASE_URL: databaseUrl,
  });
  await railwayDeploy(token, environmentId, migrateServiceId);

  spin.message("Deploying web and scheduler");
  await railwayDeploy(token, environmentId, webServiceId);
  await railwayDeploy(token, environmentId, schedulerServiceId);
  spin.stop("Railway project provisioned");

  const directory = path.resolve("harly-railway");
  await mkdir(directory, { recursive: true });
  const env =
    Object.entries(sharedEnv)
      .map(([key, value]) => `${key}=${envLine(value)}`)
      .join("\n") + "\n";
  await atomicWrite(path.join(directory, ".env"), env, 0o600);

  p.note(
    `Project    ${projectName} (${projectId})\nURL        ${url.origin}\nImage      ${image}\nSecrets    ${path.join(directory, ".env")} (mode 0600, local record only)\n\n` +
      "The migrate service ran once and can be deleted from the Railway dashboard once its deployment succeeds. " +
      "Watch build/deploy logs at railway.app; the web and scheduler services redeploy automatically on future `git push` if you later connect a GitHub repo.",
    "Railway deployment provisioned",
  );
  p.outro(
    `Harly is deploying to ${accent(url.origin)}. Never commit the generated .env file.`,
  );
}

async function cloudGuide(provider: "fly" | "digitalocean") {
  const providerName = provider === "fly" ? "Fly.io" : "DigitalOcean";
  showBrand(providerName, cliVersion);
  p.intro(accentBadge(` Deploy Harly on ${providerName} `));
  const url = normalizeUrl(
    unwrapPrompt(
      await p.text({
        message: "Public URL",
        placeholder: "https://hiring.example.com",
        validate: validatePublicOrigin,
      }),
    ),
    "external",
  );
  const email = unwrapPrompt(
    await p.text({ message: "Initial owner email", validate: validateEmail }),
  ).toLowerCase();
  const bucket = unwrapPrompt(
    await p.text({
      message: "S3-compatible bucket (required for cloud uploads)",
      validate: (value) =>
        value?.trim()
          ? undefined
          : "S3 storage is required on cloud platforms.",
    }),
  );
  const region = unwrapPrompt(
    await p.text({ message: "S3 region", initialValue: "auto" }),
  );
  const accessKey = unwrapPrompt(
    await p.password({
      message: "S3 access key",
      validate: (value) => (value ? undefined : "Required."),
    }),
  );
  const secretKey = unwrapPrompt(
    await p.password({
      message: "S3 secret key",
      validate: (value) => (value ? undefined : "Required."),
    }),
  );
  const databaseUrl =
    provider === "digitalocean"
      ? unwrapPrompt(
          await p.password({
            message: "DigitalOcean Managed PostgreSQL connection URL",
            validate: validateDatabaseUrl,
          }),
        )
      : undefined;
  const directory = path.resolve(`harly-${provider}`);
  await mkdir(directory, { recursive: true });
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
  await atomicWrite(path.join(directory, ".env"), env, 0o600);

  const deploymentRelease = await officialRelease();
  const image = releaseImage(deploymentRelease);
  if (provider === "fly") {
    await atomicWrite(
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
      `  - { key: ${key}, scope: RUN_TIME, type: SECRET, value: ${yaml(value)} }`;
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
    await atomicWrite(path.join(directory, "app.yaml"), appSpec, 0o600);
  }
  const next =
    provider === "fly"
      ? `Run \`fly launch --no-deploy\` in ${shellQuote(directory)}, attach Managed Postgres, import .env as Fly secrets, then run \`fly deploy\`.`
      : `The generated app spec already includes your Managed PostgreSQL URL as an encrypted app-level secret. Deploy with \`doctl apps create --spec ${shellQuote(path.join(directory, "app.yaml"))}\`.`;
  p.note(
    `Image     ${image}\nSecrets   ${path.join(directory, ".env")} (mode 0600)${provider === "digitalocean" ? `\nApp spec  ${path.join(directory, "app.yaml")} (mode 0600)` : ""}\nStorage   S3 required\n\n${next}`,
    "Cloud deployment prepared",
  );
  p.outro("Your configuration is ready. Never commit generated secret files.");
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
    p.intro(accentBadge(" Welcome to Harly "));
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
            value: "railway",
            label: "Deploy on Railway",
            hint: "managed Postgres + S3",
          },
          {
            value: "fly",
            label: "Deploy on Fly.io",
            hint: "managed Postgres + S3",
          },
          {
            value: "digitalocean",
            label: "Deploy on DigitalOcean",
            hint: "App Platform + managed Postgres + S3",
          },
          { value: "help", label: "Show advanced commands" },
        ],
      }),
    );
    if (choice === "install") return init();
    if (choice === "railway") return railwayGuide();
    if (choice === "fly" || choice === "digitalocean")
      return cloudGuide(choice);
    usage();
    return;
  }
  p.intro(accentBadge(" Harly management "));
  p.note(
    `${installation.config.publicUrl}\n${installation.config.image}\n${installation.directory}`,
    "Detected installation",
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

async function main() {
  switch (command) {
    case "menu":
      return menu();
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
    case "update":
      return upgrade();
    case "uninstall":
      return uninstall();
    case "help":
    case "--help":
    case "-h":
      usage();
      return;
    case "--version":
    case "-v":
      process.stdout.write(`${cliVersion}\n`);
      return;
    default:
      usage();
      throw new CliError(`Unknown command: ${command}`, 2);
  }
}

main().catch((error) => {
  const cliError =
    error instanceof CliError
      ? error
      : new CliError(
          error instanceof Error ? error.message : "Unexpected failure.",
        );
  if (cliError.message) process.stderr.write(`${cliError.message}\n`);
  process.exitCode = cliError.exitCode;
});
