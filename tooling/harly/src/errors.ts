import * as p from "@clack/prompts";
import { promises as dns } from "node:dns";
import process from "node:process";
import { run } from "./shell.js";

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: 1 | 2 = 1,
  ) {
    super(message);
  }
}

type OwnerKind =
  | { kind: "systemd"; unit: string }
  | { kind: "container"; name: string; project?: string }
  | { kind: "process"; name: string; pid?: number }
  | { kind: "unknown"; raw: string };

export type PortDetail = {
  port: number;
  protocol: "tcp" | "udp";
  owner?: OwnerKind;
};

export type RenderContext = { interactive: boolean; yes: boolean };

export type RenderResult =
  | { kind: "recovered" }
  | { kind: "switch-mode"; mode: "external" | "local" }
  | { kind: "change-port"; port: number }
  | { kind: "abort"; exitCode: 1 | 2 };

/** Thrown when the user picks "switch to external proxy" or "pick a different
 * port" in the port-conflict UI. The caller re-runs preflight with the new
 * mode/port so the rest of init can continue. */
export class RetryWithOptions extends CliError {
  constructor(
    readonly mode?: "external" | "local",
    readonly port?: number,
  ) {
    super("", 2);
  }
}

abstract class HarlyError extends CliError {
  abstract readonly title: string;
  abstract render(ctx: RenderContext): Promise<RenderResult>;
}

const SYSTEMD_UNITS = new Set([
  "nginx",
  "apache2",
  "httpd",
  "caddy",
  "haproxy",
  "traefik",
  "lighttpd",
]);

function classifyPortOwner(raw: string | undefined): OwnerKind {
  if (!raw) return { kind: "unknown", raw: "" };
  // ss example:  users:(("nginx",pid=1234,fd=6))
  // lsof example: nginx 1234 root 6u IPv4 ... TCP *:http (LISTEN)
  const systemdMatch = raw.match(/\(([\w.-]+)\.service,pid=(\d+)/);
  if (systemdMatch) {
    return { kind: "systemd", unit: `${systemdMatch[1]}.service` };
  }
  const containerMatch = raw.match(/(?:^|[\s"])([a-z0-9_-]+-(?:caddy|traefik|nginx|web|harly)-?\d*)/i);
  if (containerMatch) {
    const name = containerMatch[1];
    return { kind: "container", name };
  }
  const processMatch = raw.match(/^\s*(\S+)\s+(\d+)/);
  if (processMatch) {
    const name = processMatch[1];
    const baseName = name.split("/").pop() ?? name;
    if (SYSTEMD_UNITS.has(baseName)) {
      return { kind: "systemd", unit: `${baseName}.service` };
    }
    return { kind: "process", name: baseName, pid: Number(processMatch[2]) };
  }
  return { kind: "unknown", raw };
}

export function detectPortOwner(
  port: number,
  protocol: "tcp" | "udp",
): OwnerKind {
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
    if (result.status === 0 && output) {
      return classifyPortOwner(output.split("\n")[0] ?? "");
    }
  }
  return { kind: "unknown", raw: "" };
}

function describeOwner(owner: OwnerKind | undefined): string {
  if (!owner) return "an unknown process";
  switch (owner.kind) {
    case "systemd":
      return `the systemd unit ${owner.unit}`;
    case "container":
      return `the Docker container ${owner.name}`;
    case "process":
      return owner.pid ? `${owner.name} (PID ${owner.pid})` : owner.name;
    case "unknown":
      return "an unknown process";
  }
}

function stopSystemdUnit(unit: string): boolean {
  const result = run("systemctl", ["stop", unit], { allowFailure: true });
  return result.status === 0;
}

function stopContainer(name: string): boolean {
  const result = run("docker", ["stop", name], { allowFailure: true });
  return result.status === 0;
}

function killProcess(pid: number): boolean {
  const result = run("kill", [String(pid)], { allowFailure: true });
  return result.status === 0;
}

class PortConflict extends HarlyError {
  readonly title = "Required port is in use";
  constructor(
    readonly conflicts: PortDetail[],
    readonly currentMode: "caddy" | "external" | "local",
    readonly currentPort: number,
  ) {
    const first = conflicts[0]!;
    super(
      `${describeOwner(first.owner)} is using ${first.protocol.toUpperCase()} ${first.port}.`,
      1,
    );
  }

  async render(ctx: RenderContext): Promise<RenderResult> {
    const first = this.conflicts[0]!;
    const owner = first.owner;
    const canChangePort = this.currentMode !== "caddy";
    const canSwitchMode = this.currentMode === "caddy";

    if (!ctx.interactive) {
      const lines = [
        `${this.title}: ${this.cause}`,
      ];
      if (owner?.kind === "systemd")
        lines.push(`Stop it with: systemctl stop ${owner.unit}`);
      if (owner?.kind === "container")
        lines.push(`Stop it with: docker stop ${owner.name}`);
      if (owner?.kind === "process" && owner.pid)
        lines.push(`Stop it with: kill ${owner.pid}`);
      if (canSwitchMode)
        lines.push(
          `Or rerun with HARLY_PROXY_MODE=external to put a reverse proxy in front.`,
        );
      if (canChangePort)
        lines.push(
          `Or rerun with HARLY_PORT=<other> to pick a different port.`,
        );
      process.stderr.write(`${lines.join("\n")}\n`);
      return { kind: "abort", exitCode: 1 };
    }

    const choices: Array<{ value: string; label: string; hint?: string }> = [];
    if (owner?.kind === "systemd") {
      choices.push({
        value: "stop-systemd",
        label: `Stop ${owner.unit}`,
        hint: `systemctl stop ${owner.unit}`,
      });
    } else if (owner?.kind === "container") {
      choices.push({
        value: "stop-container",
        label: `Stop ${owner.name}`,
        hint: `docker stop ${owner.name}`,
      });
    } else if (owner?.kind === "process" && owner.pid) {
      choices.push({
        value: "kill-process",
        label: `Stop ${owner.name} (PID ${owner.pid})`,
        hint: `kill ${owner.pid}`,
      });
    } else {
      choices.push({
        value: "manual",
        label: "Show the command to stop it manually",
      });
    }
    if (canSwitchMode) {
      choices.push({
        value: "switch-external",
        label: "Switch to external proxy mode",
        hint: "keep your existing reverse proxy, point it to 127.0.0.1:3000",
      });
    }
    if (canChangePort) {
      choices.push({
        value: "change-port",
        label: `Pick a different port (currently ${this.currentPort})`,
      });
    }
    choices.push({ value: "abort", label: "Cancel" });

    const choice = await p.select({
      message: `${this.cause} What do you want to do?`,
      options: choices,
    });
    if (p.isCancel(choice)) {
      p.cancel("Cancelled.");
      return { kind: "abort", exitCode: 2 };
    }

    if (choice === "stop-systemd" && owner?.kind === "systemd") {
      const ok = ctx.yes || stopSystemdUnit(owner.unit);
      if (ok) {
        p.log.success(`Stopped ${owner.unit}`);
        return { kind: "recovered" };
      }
      p.log.error(
        `systemctl stop ${owner.unit} did not succeed. Run it manually.`,
      );
      return { kind: "abort", exitCode: 1 };
    }
    if (choice === "stop-container" && owner?.kind === "container") {
      const ok = ctx.yes || stopContainer(owner.name);
      if (ok) {
        p.log.success(`Stopped ${owner.name}`);
        return { kind: "recovered" };
      }
      p.log.error(`docker stop ${owner.name} did not succeed. Run it manually.`);
      return { kind: "abort", exitCode: 1 };
    }
    if (choice === "kill-process" && owner?.kind === "process" && owner.pid) {
      const ok = ctx.yes || killProcess(owner.pid);
      if (ok) {
        p.log.success(`Stopped ${owner.name} (PID ${owner.pid})`);
        return { kind: "recovered" };
      }
      p.log.error(`kill ${owner.pid} did not succeed. Run it manually.`);
      return { kind: "abort", exitCode: 1 };
    }
    if (choice === "manual") {
      if (owner?.kind === "systemd")
        p.log.info(`Run: systemctl stop ${owner.unit}`);
      else if (owner?.kind === "container")
        p.log.info(`Run: docker stop ${owner.name}`);
      else if (owner?.kind === "process" && owner.pid)
        p.log.info(`Run: kill ${owner.pid}`);
      else
        p.log.info(
          `Identify the owner with: ss -ltnp 'sport = :${first.port}'  (or lsof -nP -iTCP:${first.port} -sTCP:LISTEN)`,
        );
      return { kind: "abort", exitCode: 1 };
    }
    if (choice === "switch-external") {
      p.log.success("Switching to external proxy mode.");
      return { kind: "switch-mode", mode: "external" };
    }
    if (choice === "change-port") {
      const portStr = await p.text({
        message: "New port",
        initialValue: String(this.currentPort + 1),
        validate: (value) => {
          const n = Number(value);
          if (!Number.isInteger(n) || n < 1 || n > 65535)
            return "Enter a number between 1 and 65535.";
        },
      });
      if (p.isCancel(portStr)) {
        p.cancel("Cancelled.");
        return { kind: "abort", exitCode: 2 };
      }
      return { kind: "change-port", port: Number(portStr) };
    }
    return { kind: "abort", exitCode: 1 };
  }
}

class InsufficientDisk extends HarlyError {
  readonly title = "Not enough free disk";
  constructor(
    readonly requiredGb: number,
    readonly availableGb: number,
    readonly path: string,
  ) {
    super(
      `${path} has ${availableGb.toFixed(1)} GB free, need ${requiredGb} GB.`,
      1,
    );
  }
  async render(ctx: RenderContext): Promise<RenderResult> {
    const lines = [
      `${this.title}: ${this.cause}`,
      `Free up space with: docker system prune -a`,
      `Or specify a directory with at least ${this.requiredGb} GB free.`,
    ];
    if (ctx.interactive) p.log.error(lines.join("\n"));
    else process.stderr.write(`${lines.join("\n")}\n`);
    return { kind: "abort", exitCode: 1 };
  }
}

class DockerMissing extends HarlyError {
  readonly title = "Docker is not ready";
  constructor(
    readonly reason: "not-installed" | "not-running" | "compose-too-old" | "engine-too-old",
    readonly detail: string,
  ) {
    super(detail, 1);
  }
  async render(ctx: RenderContext): Promise<RenderResult> {
    const lines = [
      `${this.title}: ${this.cause}`,
      this.reason === "not-installed"
        ? "Install Docker Engine: https://docs.docker.com/engine/install/"
        : this.reason === "not-running"
          ? "Start the Docker daemon: systemctl start docker"
          : this.reason === "compose-too-old"
            ? "Upgrade Docker Compose to 2.20 or newer: https://docs.docker.com/compose/install/"
            : "Upgrade Docker Engine to 24 or newer.",
    ];
    if (ctx.interactive) p.log.error(lines.join("\n"));
    else process.stderr.write(`${lines.join("\n")}\n`);
    return { kind: "abort", exitCode: 1 };
  }
}

class DnsFailure extends HarlyError {
  readonly title = "DNS does not resolve";
  constructor(readonly hostname: string) {
    super(`${hostname} does not resolve from this server.`, 1);
  }

  async attemptResolve(): Promise<string[] | null> {
    try {
      const answers = await dns.lookup(this.hostname, { all: true });
      return answers.length > 0
        ? [...new Set(answers.map(({ address }) => address))]
        : null;
    } catch {
      return null;
    }
  }

  async recover(ctx: RenderContext): Promise<RenderResult> {
    if (!ctx.interactive) return { kind: "abort", exitCode: 1 };
    const budgetMs = 5 * 60 * 1000;
    const startedAt = Date.now();
    const intervals: Array<[string, number]> = [
      ["15 seconds", 15_000],
      ["30 seconds", 30_000],
      ["1 minute", 60_000],
      ["2 minutes", 120_000],
    ];
    while (Date.now() - startedAt < budgetMs) {
      const remainingMs = budgetMs - (Date.now() - startedAt);
      const options = intervals
        .filter(([, ms]) => ms <= remainingMs + 1000)
        .map(([label, ms]) => ({ value: String(ms), label: `Wait ${label}` }));
      options.push({ value: "abort", label: "Cancel" });
      const choice = await p.select({
        message: `${this.hostname} does not resolve from this server. Wait for DNS propagation and retry?`,
        options,
      });
      if (p.isCancel(choice) || choice === "abort") {
        p.cancel("Cancelled.");
        return { kind: "abort", exitCode: 2 };
      }
      const ms = Number(choice);
      const spin = p.spinner();
      spin.start(`Waiting ${Math.round(ms / 1000)}s before retrying`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      spin.message("Checking DNS");
      const answers = await this.attemptResolve();
      if (answers) {
        spin.stop(`Resolved: ${answers.join(", ")}`);
        return { kind: "recovered" };
      }
      spin.stop("Still not resolving");
    }
    return { kind: "abort", exitCode: 1 };
  }

  async render(ctx: RenderContext): Promise<RenderResult> {
    const isSub = this.hostname.split(".").length > 2;
    const lines = [
      `${this.title}: ${this.cause}`,
      `Create an A record for ${this.hostname} pointing to this server's public IPv4 address${isSub ? " (subdomains are recommended)" : ""}.`,
      `If the server has IPv6, add an AAAA record too. Otherwise remove any incorrect AAAA record.`,
      `Verify with: dig +short A ${this.hostname}`,
      `Then rerun the installer.`,
    ];
    if (ctx.interactive) p.log.error(lines.join("\n"));
    else process.stderr.write(`${lines.join("\n")}\n`);
    return { kind: "abort", exitCode: 1 };
  }
}

export type HarlyErrorInstance =
  | PortConflict
  | InsufficientDisk
  | DockerMissing
  | DnsFailure;

export {
  PortConflict,
  InsufficientDisk,
  DockerMissing,
  DnsFailure,
};

/** Used by main() to render a thrown error. Never returns: the inner render
 * either throws or the caller decides what to do based on the returned
 * `RenderResult`. */
export async function handleHarlyError(
  error: unknown,
  ctx: RenderContext,
): Promise<RenderResult> {
  if (error instanceof HarlyError) return error.render(ctx);
  if (error instanceof CliError) {
    if (error.message) process.stderr.write(`${error.message}\n`);
    return { kind: "abort", exitCode: error.exitCode };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message) process.stderr.write(`${message}\n`);
  return { kind: "abort", exitCode: 1 };
}

export {};

