import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { CliError } from "./errors.js";
import { embeddedRelease, type HarlyRelease } from "./release.js";
import { resultOk, type CliResult } from "./result.js";
import { run } from "./shell.js";
import { compareSemver, isStableVersion } from "./version.js";

/**
 * Host-side updater.
 *
 * The web container can neither pull images nor restart itself, and mounting
 * the Docker socket into it would hand anyone who finds a bug in Harly root on
 * the host. So the app only *records* "an owner wants version X" (or "the
 * auto-update window is open"), and this process, which already lives on the
 * host next to compose.yaml and the Docker socket, polls for that record and
 * performs it by running the same `harly update` an operator would run by hand.
 * It adds three things the manual command does not do:
 *
 *   - it refuses any version the stable release channel does not name, so a
 *     compromised or confused web app cannot make it install an arbitrary tag;
 *   - it rolls back (restores the pre-update backup and the previous image
 *     pin) when the update fails after the installation was changed;
 *   - it reports progress and the outcome to the app.
 */

const UPDATER_TOKEN_CONTEXT = "harly:updater:v1";
const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_MANIFEST_URL =
  "https://raw.githubusercontent.com/Vytral/harly/main/release-manifest.json";
const JOURNAL_FILE = ".harly-updater.json";
export const UNIT_NAME = "harly-updater";

/**
 * The bearer token the app accepts from the updater: an HMAC of CRON_SECRET,
 * not CRON_SECRET itself (apps/web/src/features/updates/updater-token.ts holds
 * the same derivation and the same test vector). The updater already reads this
 * install's `.env`, so no new secret has to be provisioned, while a leaked cron
 * request cannot impersonate the updater and the token cannot be reversed into
 * the cron secret.
 */
export function deriveUpdaterToken(cronSecret: string): string {
  return createHmac("sha256", cronSecret).update(UPDATER_TOKEN_CONTEXT).digest("hex");
}

/** Parses `.env` the way the installer writes it: `KEY=value` or `KEY="json"`. */
export function parseEnvFile(contents: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of contents.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    try {
      values.set(match[1]!, String(JSON.parse(match[2]!)));
    } catch {
      values.set(match[1]!, match[2]!);
    }
  }
  return values;
}

export type ClaimedRequest = {
  id: string;
  targetVersion: string;
  trigger: "manual" | "auto";
};

/** Validates the app's answer instead of trusting its shape. */
export function parseClaim(payload: unknown): ClaimedRequest | null {
  if (!payload || typeof payload !== "object") return null;
  const request = (payload as { request?: unknown }).request;
  if (!request || typeof request !== "object") return null;
  const { id, targetVersion, trigger } = request as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(id) ||
    typeof targetVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(targetVersion)
  ) {
    return null;
  }
  return { id, targetVersion, trigger: trigger === "auto" ? "auto" : "manual" };
}

export type ReportStatus = "running" | "succeeded" | "failed" | "rolled_back";

export type UpdateOutcome = {
  status: Exclude<ReportStatus, "running">;
  message: string;
};

export type UpdateDeps = {
  directory: string;
  report: (status: ReportStatus, message: string, logTail?: string) => Promise<void>;
  /** The stable release as the channel names it right now; null when unreachable. */
  fetchStableRelease: () => Promise<HarlyRelease | null>;
  /** Runs `harly update` for this installation. */
  runUpdate: (onLine: (line: string) => void) => Promise<{ code: number; output: string }>;
  /** Runs `harly restore <archive> --force` for this installation. */
  runRestore: (archive: string) => Promise<{ code: number; output: string }>;
  now: () => number;
};

async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** Newest rollback archive written at or after `since` (ms). */
export async function findArchiveSince(directory: string, since: number): Promise<string | null> {
  const folder = path.join(directory, "backups");
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return null;
  }
  let best: { file: string; mtime: number } | null = null;
  for (const name of names) {
    if (!/^harly-.*\.tar\.gz(?:\.age)?$/.test(name)) continue;
    const file = path.join(folder, name);
    const { mtimeMs } = await stat(file);
    // One second of slack: file times may be truncated to whole seconds.
    if (mtimeMs >= since - 1_000 && (!best || mtimeMs > best.mtime)) best = { file, mtime: mtimeMs };
  }
  return best?.file ?? null;
}

const tail = (output: string, max = 6_000) => output.slice(-max);

/**
 * Executes one claimed request: verify, update, and roll back if the update
 * leaves the installation changed but unhealthy. Never throws; every path ends
 * in a reported outcome so the app is not left showing "updating" forever.
 */
export async function performUpdate(
  request: ClaimedRequest,
  deps: UpdateDeps,
): Promise<UpdateOutcome> {
  const finish = async (outcome: UpdateOutcome, output?: string) => {
    await deps.report(outcome.status, outcome.message, output ? tail(output) : undefined);
    return outcome;
  };

  // 1. Only ever install what the stable channel names. The request carries a
  //    version, never an image: the digest comes from the manifest.
  const release = await deps.fetchStableRelease();
  if (!release) {
    return finish({
      status: "failed",
      message: "Could not read the release channel from this server, so nothing was changed.",
    });
  }
  if (!isStableVersion(release.version) || release.version !== request.targetVersion) {
    return finish({
      status: "failed",
      message: `The channel now serves ${release.version}, not ${request.targetVersion}. Nothing was changed; request the update again.`,
    });
  }

  // 2. Snapshot exactly what a rollback has to put back.
  const envPath = path.join(deps.directory, ".env");
  const configPath = path.join(deps.directory, "harly.config.json");
  const [envBefore, configBefore] = await Promise.all([readOptional(envPath), readOptional(configPath)]);
  if (envBefore === null || configBefore === null) {
    return finish({
      status: "failed",
      message: `${envBefore === null ? ".env" : "harly.config.json"} is missing from ${deps.directory}. Nothing was changed.`,
    });
  }
  const startedAt = deps.now();
  const journal = path.join(deps.directory, JOURNAL_FILE);
  await writeFile(
    journal,
    `${JSON.stringify({ requestId: request.id, targetVersion: request.targetVersion, startedAt })}\n`,
    { mode: 0o600 },
  );

  // 3. Update. `harly update` writes the backup, pulls the pinned digest,
  //    migrates, recreates the services and waits for healthchecks.
  await deps.report("running", `Backing up, then updating to ${request.targetVersion}.`);
  let lastProgress = 0;
  const result = await deps.runUpdate((line) => {
    const trimmed = line.trim();
    if (!trimmed || deps.now() - lastProgress < 15_000) return;
    lastProgress = deps.now();
    // Best effort: the app restarts partway through, so this may not land.
    void deps.report("running", trimmed.slice(0, 200)).catch(() => undefined);
  });

  if (result.code === 0) {
    await rm(journal, { force: true });
    return finish(
      { status: "succeeded", message: `Updated to ${request.targetVersion}.` },
      result.output,
    );
  }

  // 4. Failed. If the installation was never touched (preflight, backup or pull
  //    failed; `harly update` already put .env back), there is nothing to undo.
  const [envNow, configNow] = await Promise.all([readOptional(envPath), readOptional(configPath)]);
  if (envNow === envBefore && configNow === configBefore) {
    await rm(journal, { force: true });
    return finish(
      {
        status: "failed",
        message: "The update failed before changing anything. Harly is still on the previous version.",
      },
      result.output,
    );
  }

  // 5. The installation points at the new release. Migrations are forward-only,
  //    so the previous *image* cannot simply be started: put the old pins back
  //    and restore the pre-update backup (database and uploads) taken in step 3.
  const archive = await findArchiveSince(deps.directory, startedAt);
  if (!archive) {
    return finish(
      {
        status: "failed",
        message:
          "The update failed and no pre-update backup was found, so it was not rolled back automatically. Run `harly doctor`.",
      },
      result.output,
    );
  }
  await deps.report("running", "The update failed. Restoring the pre-update backup.");
  await writeFile(envPath, envBefore, { mode: 0o600 });
  await writeFile(configPath, configBefore);
  const restore = await deps.runRestore(archive);
  if (restore.code !== 0) {
    return finish(
      {
        status: "failed",
        message: `The update failed and the automatic rollback did not complete. Restore ${path.relative(deps.directory, archive)} by hand: harly restore <archive> --force.`,
      },
      `${result.output}\n--- rollback ---\n${restore.output}`,
    );
  }
  await rm(journal, { force: true });
  return finish(
    {
      status: "rolled_back",
      message: "The update failed, so Harly was restored to the version it was running before.",
    },
    `${result.output}\n--- rollback ---\n${restore.output}`,
  );
}

type Settings = {
  directory: string;
  baseUrl: string;
  token: string;
  intervalMs: number;
  manifestUrl: string;
  cliVersion: string;
};

async function api(settings: Settings, route: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${settings.baseUrl}${route}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${route} answered HTTP ${response.status}`);
  }
  return response.json().catch(() => ({}));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reports with retries: the app is down while its own container restarts. */
async function reportWithRetry(
  settings: Settings,
  requestId: string,
  status: ReportStatus,
  message: string,
  logTail?: string,
) {
  const terminal = status !== "running";
  const attempts = terminal ? 60 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await api(settings, "/api/updater/report", { requestId, status, message, logTail });
      return;
    } catch (error) {
      // 409 means the app already knows (it saw the new version come up).
      if (error instanceof Error && error.message.includes("HTTP 409")) return;
      if (attempt === attempts - 1) log(`could not report ${status}: ${String(error)}`);
      else await sleep(5_000);
    }
  }
}

function log(message: string) {
  process.stderr.write(`${new Date().toISOString()} harly-updater: ${message}\n`);
}

async function fetchStableRelease(url: string): Promise<HarlyRelease | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const candidate = (response.ok ? await response.json() : null) as Partial<HarlyRelease> | null;
    if (
      candidate &&
      typeof candidate.version === "string" &&
      candidate.image === embeddedRelease.image &&
      typeof candidate.digest === "string" &&
      /^sha256:[a-f0-9]{64}$/.test(candidate.digest) &&
      compareSemver(candidate.version, "0.0.0") !== null
    ) {
      return candidate as HarlyRelease;
    }
  } catch {
    // An unreachable channel is reported by the caller as "nothing changed".
  }
  return null;
}

/** Runs this same CLI as a child. Output is captured (tail kept) and streamed to `onLine`. */
function runSelf(
  args: string[],
  cwd: string,
  onLine: (line: string) => void,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const entry = process.argv[1];
    if (!entry) return resolve({ code: 1, output: "Cannot locate the harly entry point." });
    const child = spawn(process.execPath, [entry, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      // CI makes the child skip every prompt and spinner, whatever the terminal.
      env: { ...process.env, CI: "1", NO_COLOR: "1" },
    });
    let output = "";
    let buffer = "";
    const consume = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      output = (output + text).slice(-20_000);
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.once("error", (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
    child.once("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function loadSettings(
  directory: string,
  overrides: { url?: string; interval?: string },
): Promise<Settings> {
  const env = parseEnvFile((await readOptional(path.join(directory, ".env"))) ?? "");
  const cronSecret = env.get("CRON_SECRET");
  if (!cronSecret) {
    throw new CliError(
      `CRON_SECRET is missing from ${path.join(directory, ".env")}; the updater derives its token from it.`,
      2,
      "MISSING_SECRET",
    );
  }
  const interval = Number(overrides.interval ?? process.env.HARLY_UPDATER_INTERVAL ?? DEFAULT_INTERVAL_SECONDS);
  if (!Number.isFinite(interval) || interval < 15 || interval > 3600) {
    throw new CliError("--interval must be between 15 and 3600 seconds.", 2, "INVALID_ARGUMENT");
  }
  // The app is published on the loopback port by compose.yaml, so the updater
  // talks to it directly: no TLS, proxy or public DNS involved, and the token
  // never crosses the network.
  const port = env.get("HARLY_PORT") || process.env.HARLY_PORT || "3000";
  return {
    directory,
    baseUrl: (overrides.url ?? `http://127.0.0.1:${port}`).replace(/\/+$/, ""),
    token: deriveUpdaterToken(cronSecret),
    intervalMs: interval * 1000,
    manifestUrl: process.env.HARLY_RELEASE_MANIFEST_URL ?? DEFAULT_MANIFEST_URL,
    cliVersion: CLI_VERSION,
  };
}

let CLI_VERSION = "unknown";

async function recoverInterruptedUpdate(settings: Settings) {
  const journalPath = path.join(settings.directory, JOURNAL_FILE);
  const raw = await readOptional(journalPath);
  if (!raw) return;
  await rm(journalPath, { force: true });
  try {
    const { requestId } = JSON.parse(raw) as { requestId?: string };
    if (!requestId) return;
    log(`the updater stopped during request ${requestId}; reporting it as failed`);
    await reportWithRetry(
      settings,
      requestId,
      "failed",
      "The updater was interrupted during this update. Run `harly doctor` on the server; the pre-update backup is in the backups folder.",
    );
  } catch {
    // A corrupt journal is not worth stopping the updater for.
  }
}

export async function runUpdater(
  settings: Settings,
  options: { once: boolean },
): Promise<void> {
  let stopping = false;
  let updating = false;
  const stop = () => {
    stopping = true;
    // Never abandon a half-finished update: the loop exits once it returns.
    if (!updating) process.exit(0);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  await recoverInterruptedUpdate(settings);
  log(`polling ${settings.baseUrl} every ${settings.intervalMs / 1000}s for ${settings.directory}`);

  while (!stopping) {
    try {
      const claim = parseClaim(
        await api(settings, "/api/updater/claim", { updaterVersion: settings.cliVersion }),
      );
      if (claim) {
        updating = true;
        log(`update to ${claim.targetVersion} requested (${claim.trigger})`);
        const outcome = await performUpdate(claim, {
          directory: settings.directory,
          report: (status, message, logTail) =>
            reportWithRetry(settings, claim.id, status, message, logTail),
          fetchStableRelease: () => fetchStableRelease(settings.manifestUrl),
          runUpdate: (onLine) =>
            runSelf(["update", settings.directory, "--yes", "--non-interactive"], settings.directory, onLine),
          runRestore: (archive) =>
            runSelf(
              ["restore", archive, settings.directory, "--force", "--non-interactive"],
              settings.directory,
              () => undefined,
            ),
          now: () => Date.now(),
        });
        updating = false;
        log(`${outcome.status}: ${outcome.message}`);
      }
    } catch (error) {
      updating = false;
      log(`poll failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (options.once || stopping) return;
    await sleep(settings.intervalMs);
  }
}

// ---------------------------------------------------------------------------
// install-service
// ---------------------------------------------------------------------------

export function renderSystemdUnit(input: {
  directory: string;
  node: string;
  entry: string;
  user: string;
}): string {
  const quote = (value: string) => (/[\s"\\]/.test(value) ? JSON.stringify(value) : value);
  return `[Unit]
Description=Harly host updater
Documentation=https://docs.harly.dev
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${input.user}
WorkingDirectory=${quote(input.directory)}
ExecStart=${quote(input.node)} ${quote(input.entry)} updater run ${quote(input.directory)}
Restart=always
RestartSec=15
# An update can take many minutes. Let it finish instead of killing it mid-migration.
TimeoutStopSec=1800
KillMode=mixed

[Install]
WantedBy=multi-user.target
`;
}

async function installService(
  directory: string,
  options: { dryRun: boolean; outputDir?: string },
): Promise<CliResult> {
  const entry = await realpath(process.argv[1] ?? "").catch(() => "");
  if (!entry || /(?:^|[/\\])_npx(?:[/\\]|$)/.test(entry)) {
    throw new CliError(
      "The service has to run a permanent copy of the CLI. Install it first with `npm install -g @harly/cli`, then run `harly updater install-service` again.",
      2,
      "INVALID_CONFIGURATION",
    );
  }
  const user = process.env.SUDO_USER || os.userInfo().username;
  const unit = renderSystemdUnit({ directory, node: process.execPath, entry, user });
  const target = `/etc/systemd/system/${UNIT_NAME}.service`;
  const manual = [
    `sudo cp ${UNIT_NAME}.service ${target}`,
    "sudo systemctl daemon-reload",
    `sudo systemctl enable --now ${UNIT_NAME}`,
  ];

  if (options.outputDir) {
    const file = path.join(path.resolve(options.outputDir), `${UNIT_NAME}.service`);
    await writeFile(file, unit);
    process.stderr.write(`Wrote ${file}\nInstall it with:\n  ${manual.join("\n  ")}\n`);
    return resultOk("updater", "unit-written", { file, commands: manual });
  }
  const canInstall = process.platform === "linux" && process.getuid?.() === 0 && !options.dryRun;
  if (!canInstall) {
    process.stdout.write(unit);
    process.stderr.write(
      options.dryRun
        ? "\nDry run: nothing was installed.\n"
        : process.platform !== "linux"
          ? "\nsystemd is Linux only. Run `harly updater run` under your own supervisor, or from cron with `--once`.\n"
          : `\nRun as root to install it directly, or save the unit above as ${UNIT_NAME}.service and:\n  ${manual.join("\n  ")}\n`,
    );
    return resultOk("updater", "dry-run", { unit, sideEffects: false });
  }
  await writeFile(target, unit);
  await chmod(target, 0o644);
  run("systemctl", ["daemon-reload"]);
  run("systemctl", ["enable", "--now", UNIT_NAME]);
  process.stderr.write(`Installed and started ${UNIT_NAME}. Logs: journalctl -u ${UNIT_NAME} -f\n`);
  return resultOk("updater", "installed", { unit: target, user });
}

async function status(settings: Settings): Promise<CliResult> {
  let reachable = false;
  try {
    const response = await fetch(`${settings.baseUrl}/api/health/live`, {
      signal: AbortSignal.timeout(5_000),
    });
    reachable = response.ok;
  } catch {
    // reported below
  }
  const service = run("systemctl", ["is-active", UNIT_NAME], { allowFailure: true });
  const serviceState =
    service.error || service.status === null ? "unknown" : String(service.stdout ?? "").trim() || "inactive";
  const journal = await readOptional(path.join(settings.directory, JOURNAL_FILE));
  process.stdout.write(
    [
      `Installation   ${settings.directory}`,
      `Instance       ${settings.baseUrl} (${reachable ? "reachable" : "not reachable"})`,
      `Service        ${UNIT_NAME}: ${serviceState}`,
      `Update running ${journal ? "yes (journal present)" : "no"}`,
      "",
    ].join("\n"),
  );
  return resultOk("updater", "completed", {
    directory: settings.directory,
    url: settings.baseUrl,
    reachable,
    service: serviceState,
    updateInProgress: Boolean(journal),
  });
}

// ---------------------------------------------------------------------------
// command entry point (registered from index.ts)
// ---------------------------------------------------------------------------

async function findInstallDirectory(start: string): Promise<string> {
  let directory = path.resolve(start);
  for (;;) {
    if ((await readOptional(path.join(directory, "harly.config.json"))) !== null) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new CliError(
        "No Harly installation found here. Run this from the install directory, or pass its path.",
        2,
        "INVALID_CONFIGURATION",
      );
    }
    directory = parent;
  }
}

export const updaterHelp: Array<[string, string]> = [
  [
    "harly updater run [directory] [--once] [--interval seconds]",
    "Run the host updater: apply owner-requested and scheduled updates",
  ],
  ["harly updater install-service [directory] [--dry-run]", "Install the updater as a systemd service"],
  ["harly updater status [directory] [--json]", "Show whether the updater service and instance are up"],
];

/**
 * `harly updater <run|install-service|status> [directory]`. Returns the JSON
 * result for the caller to emit, so there is exactly one result line per run.
 */
export async function updaterCommand(input: {
  positionals: string[];
  flags: Set<string>;
  values: Map<string, string>;
  cliVersion: string;
}): Promise<CliResult | void> {
  CLI_VERSION = input.cliVersion;
  const [subcommand, directoryArg] = input.positionals;
  if (!subcommand || !["run", "install-service", "status"].includes(subcommand)) {
    throw new CliError(
      `Usage:\n${updaterHelp.map(([usage, description]) => `  ${usage}\n      ${description}`).join("\n")}`,
      2,
      "INVALID_ARGUMENT",
    );
  }
  const directory = await findInstallDirectory(directoryArg ?? process.cwd());

  if (subcommand === "install-service") {
    return installService(directory, {
      dryRun: input.flags.has("--dry-run"),
      outputDir: input.values.get("--output-dir"),
    });
  }
  const settings = await loadSettings(directory, {
    url: input.values.get("--url"),
    interval: input.values.get("--interval"),
  });
  if (subcommand === "status") return status(settings);
  await runUpdater(settings, { once: input.flags.has("--once") });
  return resultOk("updater", "completed");
}
