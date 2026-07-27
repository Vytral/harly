#!/usr/bin/env node

// src/index.ts
import { createHash, randomBytes } from "node:crypto";
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
  writeFile
} from "node:fs/promises";
import { createServer, isIP } from "node:net";
import { createSocket } from "node:dgram";
import os from "node:os";
import path from "node:path";
import process3 from "node:process";
import * as p3 from "@clack/prompts";
import pc2 from "picocolors";

// src/errors.ts
import * as p from "@clack/prompts";
import { promises as dns } from "node:dns";
import process from "node:process";

// src/shell.ts
import { spawnSync } from "node:child_process";
function run(program, commandArgs, options = {}) {
  const result = spawnSync(program, commandArgs, {
    cwd: options.cwd,
    input: options.input,
    // Database dumps are binary. Never decode them as UTF-8 on the way out
    // of Docker, otherwise pg_restore receives a silently corrupted archive.
    encoding: options.input || options.binary ? void 0 : "utf8",
    stdio: options.input || options.binary ? ["pipe", "pipe", "pipe"] : "pipe",
    maxBuffer: 1024 * 1024 * 512
  });
  if (result.status !== 0 && !options.allowFailure) {
    const message = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new Error(
      `${program} ${commandArgs.join(" ")} failed${message ? `: ${message.trim()}` : "."}`
    );
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
  return expected.every(
    (part, index) => (actual[index] ?? 0) === part ? true : (actual[index] ?? 0) > part ? true : expected.slice(0, index).every((item, i) => item === (actual[i] ?? 0)) ? false : true
  );
}

// src/errors.ts
var CliError = class extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
  exitCode;
};
var RetryWithOptions = class extends CliError {
  constructor(mode, port) {
    super("", 2);
    this.mode = mode;
    this.port = port;
  }
  mode;
  port;
};
var HarlyError = class extends CliError {
  constructor(message, exitCode = 1) {
    super(message, exitCode);
    this.cause = message;
  }
};
var SYSTEMD_UNITS = /* @__PURE__ */ new Set([
  "nginx",
  "apache2",
  "httpd",
  "caddy",
  "haproxy",
  "traefik",
  "lighttpd"
]);
function classifyPortOwner(raw) {
  if (!raw) return { kind: "unknown", raw: "" };
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
function detectPortOwner(port, protocol) {
  const commands = protocol === "udp" ? [
    ["ss", ["-H", "-lunp", `sport = :${port}`]],
    ["lsof", ["-nP", `-iUDP:${port}`]]
  ] : [
    ["ss", ["-H", "-ltnp", `sport = :${port}`]],
    ["lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]]
  ];
  for (const [program, args2] of commands) {
    const result = run(program, args2, { allowFailure: true });
    const output = String(result.stdout ?? "").trim();
    if (result.status === 0 && output) {
      return classifyPortOwner(output.split("\n")[0] ?? "");
    }
  }
  return { kind: "unknown", raw: "" };
}
function describeOwner(owner) {
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
function stopSystemdUnit(unit) {
  const result = run("systemctl", ["stop", unit], { allowFailure: true });
  return result.status === 0;
}
function stopContainer(name) {
  const result = run("docker", ["stop", name], { allowFailure: true });
  return result.status === 0;
}
function killProcess(pid) {
  const result = run("kill", [String(pid)], { allowFailure: true });
  return result.status === 0;
}
var PortConflict = class extends HarlyError {
  constructor(conflicts, currentMode, currentPort) {
    const first = conflicts[0];
    super(
      `${describeOwner(first.owner)} is using ${first.protocol.toUpperCase()} ${first.port}.`,
      1
    );
    this.conflicts = conflicts;
    this.currentMode = currentMode;
    this.currentPort = currentPort;
  }
  conflicts;
  currentMode;
  currentPort;
  title = "Required port is in use";
  async render(ctx) {
    const first = this.conflicts[0];
    const owner = first.owner;
    const canChangePort = this.currentMode !== "caddy";
    const canSwitchMode = this.currentMode === "caddy";
    if (!ctx.interactive) {
      const lines = [
        `${this.title}: ${this.cause}`
      ];
      if (owner?.kind === "systemd")
        lines.push(`Stop it with: systemctl stop ${owner.unit}`);
      if (owner?.kind === "container")
        lines.push(`Stop it with: docker stop ${owner.name}`);
      if (owner?.kind === "process" && owner.pid)
        lines.push(`Stop it with: kill ${owner.pid}`);
      if (canSwitchMode)
        lines.push(
          `Or rerun with HARLY_PROXY_MODE=external to put a reverse proxy in front.`
        );
      if (canChangePort)
        lines.push(
          `Or rerun with HARLY_PORT=<other> to pick a different port.`
        );
      process.stderr.write(`${lines.join("\n")}
`);
      return { kind: "abort", exitCode: 1 };
    }
    const choices = [];
    if (owner?.kind === "systemd") {
      choices.push({
        value: "stop-systemd",
        label: `Stop ${owner.unit}`,
        hint: `systemctl stop ${owner.unit}`
      });
    } else if (owner?.kind === "container") {
      choices.push({
        value: "stop-container",
        label: `Stop ${owner.name}`,
        hint: `docker stop ${owner.name}`
      });
    } else if (owner?.kind === "process" && owner.pid) {
      choices.push({
        value: "kill-process",
        label: `Stop ${owner.name} (PID ${owner.pid})`,
        hint: `kill ${owner.pid}`
      });
    } else {
      choices.push({
        value: "manual",
        label: "Show the command to stop it manually"
      });
    }
    if (canSwitchMode) {
      choices.push({
        value: "switch-external",
        label: "Switch to external proxy mode",
        hint: "keep your existing reverse proxy, point it to 127.0.0.1:3000"
      });
    }
    if (canChangePort) {
      choices.push({
        value: "change-port",
        label: `Pick a different port (currently ${this.currentPort})`
      });
    }
    choices.push({ value: "abort", label: "Cancel" });
    const choice = await p.select({
      message: `${this.cause} What do you want to do?`,
      options: choices
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
        `systemctl stop ${owner.unit} did not succeed. Run it manually.`
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
          `Identify the owner with: ss -ltnp 'sport = :${first.port}'  (or lsof -nP -iTCP:${first.port} -sTCP:LISTEN)`
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
        }
      });
      if (p.isCancel(portStr)) {
        p.cancel("Cancelled.");
        return { kind: "abort", exitCode: 2 };
      }
      return { kind: "change-port", port: Number(portStr) };
    }
    return { kind: "abort", exitCode: 1 };
  }
};
var InsufficientDisk = class extends HarlyError {
  constructor(requiredGb, availableGb, path2) {
    super(
      `${path2} has ${availableGb.toFixed(1)} GB free, need ${requiredGb} GB.`,
      1
    );
    this.requiredGb = requiredGb;
    this.availableGb = availableGb;
    this.path = path2;
  }
  requiredGb;
  availableGb;
  path;
  title = "Not enough free disk";
  async render(ctx) {
    const lines = [
      `${this.title}: ${this.cause}`,
      `Free up space with: docker system prune -a`,
      `Or specify a directory with at least ${this.requiredGb} GB free.`
    ];
    if (ctx.interactive) p.log.error(lines.join("\n"));
    else process.stderr.write(`${lines.join("\n")}
`);
    return { kind: "abort", exitCode: 1 };
  }
};
var DockerMissing = class extends HarlyError {
  constructor(reason, detail) {
    super(detail, 1);
    this.reason = reason;
    this.detail = detail;
  }
  reason;
  detail;
  title = "Docker is not ready";
  async render(ctx) {
    const lines = [
      `${this.title}: ${this.cause}`,
      this.reason === "not-installed" ? "Install Docker Engine: https://docs.docker.com/engine/install/" : this.reason === "not-running" ? "Start the Docker daemon: systemctl start docker" : this.reason === "compose-too-old" ? "Upgrade Docker Compose to 2.20 or newer: https://docs.docker.com/compose/install/" : "Upgrade Docker Engine to 24 or newer."
    ];
    if (ctx.interactive) p.log.error(lines.join("\n"));
    else process.stderr.write(`${lines.join("\n")}
`);
    return { kind: "abort", exitCode: 1 };
  }
};
var DnsFailure = class extends HarlyError {
  constructor(hostname) {
    super(`${hostname} does not resolve from this server.`, 1);
    this.hostname = hostname;
  }
  hostname;
  title = "DNS does not resolve";
  async attemptResolve() {
    try {
      const answers = await dns.lookup(this.hostname, { all: true });
      return answers.length > 0 ? [...new Set(answers.map(({ address }) => address))] : null;
    } catch {
      return null;
    }
  }
  async recover(ctx) {
    if (!ctx.interactive) return { kind: "abort", exitCode: 1 };
    const budgetMs = 5 * 60 * 1e3;
    const startedAt = Date.now();
    const intervals = [
      ["15 seconds", 15e3],
      ["30 seconds", 3e4],
      ["1 minute", 6e4],
      ["2 minutes", 12e4]
    ];
    while (Date.now() - startedAt < budgetMs) {
      const remainingMs = budgetMs - (Date.now() - startedAt);
      const options = intervals.filter(([, ms2]) => ms2 <= remainingMs + 1e3).map(([label, ms2]) => ({ value: String(ms2), label: `Wait ${label}` }));
      options.push({ value: "abort", label: "Cancel" });
      const choice = await p.select({
        message: `${this.hostname} does not resolve from this server. Wait for DNS propagation and retry?`,
        options
      });
      if (p.isCancel(choice) || choice === "abort") {
        p.cancel("Cancelled.");
        return { kind: "abort", exitCode: 2 };
      }
      const ms = Number(choice);
      const spin = p.spinner();
      spin.start(`Waiting ${Math.round(ms / 1e3)}s before retrying`);
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
  async render(ctx) {
    const isSub = this.hostname.split(".").length > 2;
    const lines = [
      `${this.title}: ${this.cause}`,
      `Create an A record for ${this.hostname} pointing to this server's public IPv4 address${isSub ? " (subdomains are recommended)" : ""}.`,
      `If the server has IPv6, add an AAAA record too. Otherwise remove any incorrect AAAA record.`,
      `Verify with: dig +short A ${this.hostname}`,
      `Then rerun the installer.`
    ];
    if (ctx.interactive) p.log.error(lines.join("\n"));
    else process.stderr.write(`${lines.join("\n")}
`);
    return { kind: "abort", exitCode: 1 };
  }
};
async function handleHarlyError(error, ctx) {
  if (error instanceof HarlyError) return error.render(ctx);
  if (error instanceof CliError) {
    if (error.message) process.stderr.write(`${error.message}
`);
    return { kind: "abort", exitCode: error.exitCode };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message) process.stderr.write(`${message}
`);
  return { kind: "abort", exitCode: 1 };
}

// src/release.ts
var embeddedRelease = {
  version: "0.1.0-beta.2",
  image: "ghcr.io/vytral/harly",
  digest: "sha256:f0b999a76fa170887f625d12835379ef57772903c792fb0b66faea9270776a16"
};
var releaseImage = (release) => `${release.image}@${release.digest}`;

// src/pull.ts
import { spawn } from "node:child_process";
import * as p2 from "@clack/prompts";

// src/theme.ts
import process2 from "node:process";
import pc from "picocolors";
var chartreuse = [200, 245, 96];
var kraft = [168, 162, 158];
var esc = "\x1B";
var truecolor = pc.isColorSupported && ["truecolor", "24bit"].includes(process2.env.COLORTERM ?? "");
function rgb([r, g, b], text3) {
  return `${esc}[38;2;${r};${g};${b}m${text3}${esc}[39m`;
}
function accent(text3) {
  if (!pc.isColorSupported) return text3;
  return truecolor ? rgb(chartreuse, text3) : pc.green(text3);
}
function soft(text3) {
  if (!pc.isColorSupported) return text3;
  return truecolor ? rgb(kraft, text3) : pc.gray(text3);
}
var ink = (text3) => pc.bold(text3);
var logo = [
  "\u2588\u2588\u2557  \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557     \u2588\u2588\u2557   \u2588\u2588\u2557",
  "\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551     \u255A\u2588\u2588\u2557 \u2588\u2588\u2554\u255D",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551      \u255A\u2588\u2588\u2588\u2588\u2554\u255D",
  "\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551       \u255A\u2588\u2588\u2554\u255D",
  "\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557   \u2588\u2588\u2551",
  "\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D   \u255A\u2550\u255D"
];
var brandShown = false;
function showBrand(context, version = "") {
  const suffix = version ? ` ${soft(`\xB7 v${version}`)}` : "";
  if (brandShown) {
    process2.stdout.write(
      `
${accent("\u25CF")} ${ink("harly")}${context ? `  ${soft(context)}` : ""}${suffix}

`
    );
    return;
  }
  brandShown = true;
  const mark = logo.map((line) => `  ${accent(line)}`).join("\n");
  process2.stdout.write(`
${mark}

  ${ink("Self-hosted ATS")}${suffix}

`);
}
var spinnerStyle = { styleFrame: accent };

// src/pull.ts
var terminal = {
  "pull complete": "done",
  "already exists": "done",
  "download complete": "downloaded"
};
function humanBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
function humanDuration(ms) {
  const seconds = Math.round(ms / 1e3);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}
function bar(done, total, width = 24) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const filled = Math.round(ratio * width);
  return `${accent("\u2588".repeat(filled))}${soft("\u2591".repeat(width - filled))}`;
}
async function pullWithProgress(cwd, services, interactive2) {
  if (!interactive2) {
    await runPlain(cwd, services);
    return;
  }
  const layers = /* @__PURE__ */ new Map();
  const bytes = /* @__PURE__ */ new Map();
  const startedAt = performance.now();
  const spin = p2.spinner(spinnerStyle);
  spin.start("Pulling container images");
  const render = () => {
    const known = [...layers.values()];
    const complete = known.filter((state) => state === "done").length;
    const active = [...layers.entries()].filter(([, state]) => state === "downloading").slice(0, 3).map(
      ([id]) => `${soft(id.slice(0, 12).padEnd(12))} ${humanBytes(bytes.get(id) ?? 0)}`
    );
    const headline = known.length ? `${bar(complete, known.length)}  ${complete}/${known.length} layers` : "contacting registry";
    spin.message(
      ["Pulling container images", headline, ...active].join("\n   ")
    );
  };
  await stream(cwd, services, (line) => {
    const match = line.match(/^\s*([0-9a-f]{8,}|Image \S+)\s+(.+?)\s*$/);
    if (!match) return;
    const [, id, rest] = match;
    if (id.startsWith("Image ")) return;
    const status = rest.replace(/\s+[\d.]+[A-Za-z]*B$/, "").toLowerCase();
    if (status.startsWith("downloading")) {
      const size = rest.match(/([\d.]+)([kKmMgG]?)B$/);
      if (size) {
        const scale = { k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[size[2].toLowerCase()];
        const observed = Number(size[1]) * (scale ?? 1);
        bytes.set(id, Math.max(bytes.get(id) ?? 0, observed));
      }
    }
    const next = terminal[status] ?? (status.startsWith("downloading") || status.startsWith("extracting") ? "downloading" : "waiting");
    if (layers.get(id) === "done" && next !== "done") return;
    layers.set(id, next);
    render();
  });
  const total = [...bytes.values()].reduce((sum, value) => sum + value, 0);
  const summary = [
    `${layers.size} layers`,
    total > 0 ? humanBytes(total) : null,
    humanDuration(performance.now() - startedAt)
  ].filter(Boolean).join(" \xB7 ");
  spin.stop(
    layers.size === 0 ? "Container images are up to date" : `Container images downloaded  ${soft(`\xB7 ${summary}`)}`
  );
}
function stream(cwd, services, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["compose", "--progress", "plain", "pull", ...services],
      { cwd, stdio: ["ignore", "pipe", "pipe"] }
    );
    let buffer = "";
    const tail = [];
    const consume = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        tail.push(line);
        if (tail.length > 20) tail.shift();
        onLine(line);
      }
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `docker compose pull failed${tail.length ? `:
${tail.join("\n")}` : "."}`
        )
      );
    });
  });
}
function runPlain(cwd, services) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "pull", ...services], {
      cwd,
      stdio: ["ignore", "inherit", "inherit"]
    });
    child.once("error", reject);
    child.once(
      "close",
      (code) => code === 0 ? resolve() : reject(new Error(`docker compose pull failed with code ${code}.`))
    );
  });
}

// src/index.ts
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
  const reservationsGb = 1.5;
  const freeGb = os.freemem() / 1024 ** 3 - reservationsGb;
  if (freeGb < 1.5) return "compact";
  if (freeGb < 3.5) return "standard";
  return "performance";
}
var args = process3.argv.slice(2);
var command = args.shift() ?? "menu";
var flags = new Set(
  args.filter((arg) => arg.startsWith("--") && !["--to"].includes(arg))
);
var positionals = args.filter(
  (arg, index) => !arg.startsWith("--") && args[index - 1] !== "--to"
);
var toIndex = args.indexOf("--to");
var toVersion = toIndex >= 0 ? args[toIndex + 1] : void 0;
var force = flags.has("--force");
var yes = flags.has("--yes");
var json = flags.has("--json");
var interactive = Boolean(
  process3.stdin.isTTY && process3.stdout.isTTY && !process3.env.CI
);
var cliVersion = "0.3.0";
var releaseManifestUrl = process3.env.HARLY_RELEASE_MANIFEST_URL ?? "https://raw.githubusercontent.com/Vytral/harly/main/release-manifest.json";
var currentOfficialRelease;
var releaseManifestChecked = false;
function validRelease(value) {
  if (!value || typeof value !== "object") return false;
  const release = value;
  return typeof release.version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    release.version
  ) && release.image === "ghcr.io/vytral/harly" && typeof release.digest === "string" && /^sha256:[a-f0-9]{64}$/.test(release.digest);
}
async function officialRelease() {
  if (releaseManifestChecked) return currentOfficialRelease ?? embeddedRelease;
  releaseManifestChecked = true;
  try {
    const response = await fetch(releaseManifestUrl, {
      signal: AbortSignal.timeout(2e3)
    });
    const candidate = response.ok ? await response.json() : null;
    if (validRelease(candidate)) currentOfficialRelease = candidate;
  } catch {
  }
  return currentOfficialRelease ?? embeddedRelease;
}
var commandHelp = [
  ["harly", "Guided menu \u2014 install, or manage a detected installation"],
  ["harly check [directory]", "Verify host requirements without installing"],
  ["harly init [directory] [--force] [--dry-run]", "Generate a new installation"],
  ["harly launch [directory] [--yes]", "Pull images and start the services"],
  ["harly doctor [directory] [--json] [--fix]", "Check services and public readiness"],
  ["harly setup-secret [directory]", "Print HARLY_SETUP_SECRET from .env"],
  ["harly backup [directory] [--encrypt]", "Write a private rollback archive"],
  ["harly restore <archive> [directory] --force", "Restore from an archive"],
  ["harly update [directory] [--to version]", "Back up, upgrade, and migrate"],
  ["harly uninstall [directory] [--remove-data]", "Stop and remove Harly"],
  ["harly deploy <railway|fly|digitalocean>", "Generate a cloud-platform config"]
];
function usage() {
  const width = Math.max(...commandHelp.map(([command2]) => command2.length));
  process3.stdout.write(
    `
  ${ink("Harly")} ${soft("\xB7 self-hosted ATS")}

${commandHelp.map(
      ([command2, description]) => `  ${accent(command2.padEnd(width))}  ${soft(description)}`
    ).join("\n")}

  ${soft(`Run ${ink("npx @harly/cli")} with no arguments for the guided experience.`)}

`
  );
}
function unwrapPrompt(value) {
  if (!p3.isCancel(value)) return value;
  p3.cancel("Installation cancelled.");
  throw new CliError("", 2);
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
async function udpPortAvailable(port) {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    socket.once("error", (error) => {
      socket.close();
      resolve(error.code !== "EADDRINUSE");
    });
    socket.bind(port, "127.0.0.1", () => socket.close(() => resolve(true)));
  });
}
function portOwner(port, protocol = "tcp") {
  const commands = protocol === "udp" ? [
    ["ss", ["-H", "-lunp", `sport = :${port}`]],
    ["lsof", ["-nP", `-iUDP:${port}`]]
  ] : [
    ["ss", ["-H", "-ltnp", `sport = :${port}`]],
    ["lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]]
  ];
  for (const [program, args2] of commands) {
    const result = run(program, args2, { allowFailure: true });
    const output = String(result.stdout ?? "").trim();
    if (result.status === 0 && output) return output.split("\n")[0].trim();
  }
  return void 0;
}
async function checkRequiredPorts(mode, requestedPort, ctx = { interactive, yes }) {
  const port = requestedPort ?? Number(process3.env.HARLY_PORT ?? 3e3);
  const checks = mode === "caddy" ? [
    { port: 80, protocol: "tcp" },
    { port: 443, protocol: "tcp" },
    { port: 443, protocol: "udp" }
  ] : [{ port, protocol: "tcp" }];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const occupied = [];
    for (const check of checks) {
      const available = check.protocol === "udp" ? await udpPortAvailable(check.port) : await portAvailable(check.port);
      if (!available) {
        const raw = portOwner(check.port, check.protocol);
        const owner = detectPortOwner(check.port, check.protocol);
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
      ctx
    );
    if (result.kind === "recovered") continue;
    if (result.kind === "switch-mode") throw new RetryWithOptions(result.mode);
    if (result.kind === "change-port") {
      throw new RetryWithOptions(void 0, result.port);
    }
    throw new CliError("", result.exitCode);
  }
  throw new CliError(
    `Could not free the required ports after 3 attempts: ${checks.map((c) => `${c.protocol.toUpperCase()} ${c.port}`).join(", ")}.`,
    1
  );
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
function detectFirewallWarning() {
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
          fix: "ufw allow 80/tcp && ufw allow 443/tcp"
        };
      }
    }
  }
  return null;
}
async function readDockerInfo() {
  const docker = run("docker", ["version", "--format", "{{.Server.Version}}"], {
    allowFailure: true
  });
  if (docker.status !== 0) {
    const stderr = String(docker.stderr ?? "").trim();
    throw new DockerMissing(
      stderr.includes("Cannot connect to the Docker daemon") || stderr.includes("Is the docker daemon running") ? "not-running" : "not-installed",
      stderr || "Docker Engine 24 or newer is required and must be running."
    );
  }
  if (!atLeast(parseVersion(String(docker.stdout)), [24, 0, 0]))
    throw new DockerMissing(
      "engine-too-old",
      `Docker Engine 24 or newer is required (found ${String(docker.stdout).trim()}).`
    );
  const plugin = run("docker", ["compose", "version", "--short"], {
    allowFailure: true
  });
  if (plugin.status !== 0 || !atLeast(parseVersion(String(plugin.stdout)), [2, 20, 0]))
    throw new DockerMissing(
      "compose-too-old",
      `Docker Compose 2.20 or newer is required (found ${String(plugin.stdout).trim() || "missing"}).`
    );
  return {
    engine: String(docker.stdout).trim(),
    compose: String(plugin.stdout).trim()
  };
}
async function readDistro() {
  if (os.platform() === "darwin") return `macOS ${os.release()}`;
  if (os.platform() === "win32") return `Windows ${os.release()}`;
  try {
    const raw = await readFile("/etc/os-release", "utf8");
    const name = raw.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1];
    if (name) return `${name} (kernel ${os.release()})`;
  } catch {
  }
  return `${os.platform()} ${os.release()}`;
}
async function preflightHost(directory) {
  if (!atLeast(parseVersion(process3.versions.node), [20, 12, 0]))
    throw new DockerMissing(
      "not-installed",
      `Node.js 20.12 or newer is required (running ${process3.versions.node}).`
    );
  const docker = await readDockerInfo().catch((error) => {
    if (error instanceof DockerMissing) throw error;
    throw new DockerMissing(
      "not-installed",
      error instanceof Error ? error.message : "Docker check failed."
    );
  });
  const diskGb = await freeDiskGb(directory);
  const requiredDiskGb = Number(process3.env.HARLY_REQUIRED_DISK_GB ?? 5);
  if (diskGb < requiredDiskGb)
    throw new InsufficientDisk(requiredDiskGb, diskGb, directory);
  return {
    distro: await readDistro(),
    cpuCount: os.cpus().length,
    memoryGb: os.totalmem() / 1024 ** 3,
    freeMemoryGb: os.freemem() / 1024 ** 3,
    diskGb,
    docker,
    firewall: detectFirewallWarning() ?? void 0
  };
}
async function preflight(mode, checkPorts = true, requestedPort, directory = process3.cwd(), ctx = { interactive, yes }) {
  const host = await preflightHost(directory);
  if (checkPorts) await checkRequiredPorts(mode ?? "caddy", requestedPort, ctx);
  return host;
}
function requiredEnvironment(name, value) {
  if (value?.trim()) return value.trim();
  throw new CliError(`${name} is required in non-interactive mode.`, 2);
}
async function confirm2(question) {
  if (yes) return true;
  if (!interactive) return false;
  return unwrapPrompt(
    await p3.confirm({ message: question, initialValue: false })
  );
}
function progressStep(message, success, action) {
  if (!interactive) {
    action();
    return;
  }
  const step = p3.spinner(spinnerStyle);
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
  if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/")
    throw new CliError(
      "Public URL must be an HTTP(S) origin without a path.",
      2
    );
  if (mode !== "local" && url.protocol !== "https:")
    throw new CliError(
      "Caddy and external proxy modes require an HTTPS public URL.",
      2
    );
  if (mode !== "local" && (isIP(url.hostname) || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)))
    throw new CliError(
      "Use a real domain or subdomain for HTTPS (for example careers.example.com), not a VPS IP or localhost.",
      2
    );
  return url;
}
async function verifyPublicDns(url, ctx = { interactive, yes }) {
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
function validateDatabaseUrl(value) {
  if (!value?.trim())
    return "A DigitalOcean Managed PostgreSQL connection URL is required.";
  try {
    const url = new URL(value.trim());
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === "/") {
      return "Enter a postgresql:// connection URL that includes a database name.";
    }
  } catch {
    return "Enter a valid postgresql:// connection URL.";
  }
  return void 0;
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
var railwayApiUrl = "https://backboard.railway.com/graphql/v2";
async function railwayApi(token, query, variables) {
  const response = await fetch(railwayApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    throw new CliError(
      `Railway API error: ${body.errors?.map((error) => error.message).join("; ") ?? response.statusText}`
    );
  }
  return body.data;
}
async function railwayCreateProject(token, name) {
  const data = await railwayApi(
    token,
    `mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) { id environments { edges { node { id name } } } }
    }`,
    { input: { name } }
  );
  const environmentId = data.projectCreate.environments.edges[0]?.node.id;
  if (!environmentId)
    throw new CliError(
      "Railway did not return a default environment for the new project."
    );
  return { projectId: data.projectCreate.id, environmentId };
}
async function railwayCreateService(token, projectId, name, image) {
  const data = await railwayApi(
    token,
    `mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id } }`,
    { input: { projectId, name, source: { image } } }
  );
  return data.serviceCreate.id;
}
async function railwaySetVariables(token, projectId, environmentId, serviceId, variables) {
  for (const [name, value] of Object.entries(variables)) {
    await railwayApi(
      token,
      `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
      { input: { projectId, environmentId, serviceId, name, value } }
    );
  }
}
async function railwayUpdateInstance(token, environmentId, serviceId, input) {
  await railwayApi(
    token,
    `mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }`,
    { serviceId, environmentId, input }
  );
}
async function railwayCreateVolume(token, projectId, environmentId, serviceId, mountPath) {
  await railwayApi(
    token,
    `mutation($input: VolumeCreateInput!) { volumeCreate(input: $input) { id } }`,
    { input: { projectId, environmentId, serviceId, mountPath } }
  );
}
async function railwayCreateDomain(token, environmentId, serviceId) {
  const data = await railwayApi(
    token,
    `mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }`,
    { input: { environmentId, serviceId } }
  );
  return data.serviceDomainCreate.domain;
}
async function railwayDeploy(token, environmentId, serviceId) {
  await railwayApi(
    token,
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId, environmentId }
  );
}
function validateEmail(value) {
  if (!value || !/^\S+@\S+\.\S+$/.test(value))
    return "Enter a valid email address.";
}
function validatePublicOrigin(value) {
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
function hostSummary(host) {
  return `${host.cpuCount} CPU \xB7 ${host.memoryGb.toFixed(1)} GB RAM \xB7 ${host.diskGb.toFixed(1)} GB free`;
}
async function collectNonInteractiveAnswers(directory) {
  const mode = process3.env.HARLY_PROXY_MODE ?? "caddy";
  if (!["caddy", "external", "local"].includes(mode))
    throw new CliError("Invalid proxy mode.", 2);
  const url = normalizeUrl(
    requiredEnvironment("HARLY_URL", process3.env.HARLY_URL),
    mode
  );
  const port = Number(
    process3.env.HARLY_PORT ?? (mode === "local" && url.port ? url.port : 3e3)
  );
  await preflight(mode, true, port, directory);
  if (mode !== "local") await verifyPublicDns(url);
  const email = requiredEnvironment(
    "HARLY_INITIAL_ADMIN_EMAIL",
    process3.env.HARLY_INITIAL_ADMIN_EMAIL
  ).toLowerCase();
  if (validateEmail(email)) throw new CliError("Invalid owner email.", 2);
  const organization = process3.env.HARLY_ORGANIZATION?.trim() || "My organization";
  const storage = process3.env.STORAGE_PROVIDER ?? "local";
  if (!["local", "s3"].includes(storage))
    throw new CliError("Invalid storage provider.", 2);
  const resourceProfile = process3.env.HARLY_RESOURCE_PROFILE ?? detectResourceProfile();
  if (!Object.hasOwn(resourceProfiles, resourceProfile))
    throw new CliError("Invalid resource profile.", 2);
  const s3 = storage === "s3" ? {
    bucket: requiredEnvironment("S3_BUCKET", process3.env.S3_BUCKET),
    region: process3.env.S3_REGION?.trim() || "auto",
    accessKeyId: requiredEnvironment(
      "S3_ACCESS_KEY_ID",
      process3.env.S3_ACCESS_KEY_ID
    ),
    secretAccessKey: requiredEnvironment(
      "S3_SECRET_ACCESS_KEY",
      process3.env.S3_SECRET_ACCESS_KEY
    ),
    endpoint: process3.env.S3_ENDPOINT?.trim() || "",
    publicUrl: process3.env.S3_PUBLIC_URL?.trim() || ""
  } : null;
  const image = process3.env.HARLY_IMAGE_REF ?? releaseImage(await officialRelease());
  if (image.endsWith(":latest"))
    throw new CliError(
      "Installations must pin a version or digest, never latest.",
      2
    );
  return {
    mode,
    url,
    port,
    email,
    organization,
    storage,
    s3,
    resourceProfile,
    image
  };
}
async function collectInteractiveAnswers(directory) {
  showBrand("Install", cliVersion);
  p3.note(
    [
      "Before continuing, prepare a public URL for this VPS.",
      "Recommended: a subdomain such as careers.example.com.",
      "Create an A record pointing to the VPS public IPv4 (and an AAAA record only if IPv6 is configured).",
      "With Caddy, TCP 80 and TCP/UDP 443 must be free and allowed by the firewall/security group.",
      "If Nginx/Traefik already uses those ports, choose external proxy and point it to 127.0.0.1:3000.",
      "Guide: https://github.com/Vytral/harly/blob/main/docs/self-hosting.md#vps-requirements"
    ].join("\n"),
    "Pre-install checklist"
  );
  const publicOrigin = unwrapPrompt(
    await p3.text({
      message: "Public domain or subdomain",
      placeholder: "careers.example.com",
      initialValue: process3.env.HARLY_URL ?? "careers.example.com",
      validate: validatePublicOrigin
    })
  );
  let mode = unwrapPrompt(
    await p3.select({
      message: "Reverse proxy",
      initialValue: process3.env.HARLY_PROXY_MODE ?? "caddy",
      options: [
        {
          value: "caddy",
          label: "Automatic HTTPS with Caddy",
          hint: "recommended"
        },
        { value: "external", label: "External Nginx or Traefik" },
        { value: "local", label: "Local HTTP only", hint: "development" }
      ]
    })
  );
  let url = normalizeUrl(publicOrigin, mode);
  const preflightSpinner = p3.spinner(spinnerStyle);
  preflightSpinner.start("Checking Docker, ports, and DNS");
  let dnsAnswers = [];
  let requestedPort = Number(
    process3.env.HARLY_PORT ?? (mode === "local" && url.port ? url.port : 3e3)
  );
  let host;
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
          if (error.port !== void 0) requestedPort = error.port;
          continue;
        }
        throw error;
      }
    }
    if (!host) {
      preflightSpinner.stop("Host preflight failed");
      throw new CliError(
        "Could not complete preflight after adjusting options. Re-run the installer.",
        1
      );
    }
    preflightSpinner.stop(
      dnsAnswers.length > 0 ? `Host preflight passed \xB7 DNS: ${dnsAnswers.join(", ")}` : "Host preflight passed"
    );
  } catch (error) {
    preflightSpinner.stop("Host preflight failed");
    throw error;
  }
  const email = unwrapPrompt(
    await p3.text({
      message: "Initial owner email",
      placeholder: "owner@example.com",
      initialValue: process3.env.HARLY_INITIAL_ADMIN_EMAIL,
      validate: validateEmail
    })
  ).toLowerCase();
  const organization = unwrapPrompt(
    await p3.text({
      message: "Organization name",
      placeholder: "Acme Inc.",
      initialValue: process3.env.HARLY_ORGANIZATION ?? "My organization",
      validate: (value) => value?.trim() ? void 0 : "Enter an organization name."
    })
  );
  const storage = unwrapPrompt(
    await p3.select({
      message: "File storage",
      initialValue: process3.env.STORAGE_PROVIDER ?? "local",
      options: [
        { value: "local", label: "Local persistent volume", hint: "simple" },
        {
          value: "s3",
          label: "S3, R2, or MinIO",
          hint: "recommended for growth"
        }
      ]
    })
  );
  const s3 = storage === "s3" ? {
    bucket: unwrapPrompt(
      await p3.text({
        message: "S3 bucket",
        initialValue: process3.env.S3_BUCKET,
        validate: (value) => value?.trim() ? void 0 : "Enter the bucket name."
      })
    ),
    region: unwrapPrompt(
      await p3.text({
        message: "S3 region",
        initialValue: process3.env.S3_REGION ?? "auto"
      })
    ),
    accessKeyId: unwrapPrompt(
      await p3.text({
        message: "S3 access key ID",
        initialValue: process3.env.S3_ACCESS_KEY_ID,
        validate: (value) => value?.trim() ? void 0 : "Enter the access key ID."
      })
    ),
    secretAccessKey: unwrapPrompt(
      await p3.password({
        message: "S3 secret access key",
        mask: "\u2022",
        validate: (value) => value?.trim() ? void 0 : "Enter the secret access key."
      })
    ),
    endpoint: unwrapPrompt(
      await p3.text({
        message: "S3 endpoint",
        placeholder: "Leave blank for AWS",
        initialValue: process3.env.S3_ENDPOINT ?? ""
      })
    ),
    publicUrl: unwrapPrompt(
      await p3.text({
        message: "S3 public URL",
        placeholder: "Optional",
        initialValue: process3.env.S3_PUBLIC_URL ?? ""
      })
    )
  } : null;
  const detectedProfile = detectResourceProfile();
  p3.note(hostSummary(host), `Detected host \xB7 ${detectedProfile}`);
  const resourceProfile = unwrapPrompt(
    await p3.select({
      message: "Resource profile",
      initialValue: process3.env.HARLY_RESOURCE_PROFILE ?? detectedProfile,
      options: [
        { value: "compact", label: "Compact", hint: "2 GB RAM + swap" },
        { value: "standard", label: "Standard", hint: "4 GB RAM, recommended" },
        {
          value: "performance",
          label: "Performance",
          hint: "8 GB RAM or more"
        }
      ]
    })
  );
  const image = process3.env.HARLY_IMAGE_REF ?? releaseImage(await officialRelease());
  if (image.endsWith(":latest"))
    throw new CliError(
      "Installations must pin a version or digest, never latest.",
      2
    );
  const services = `PostgreSQL, migrator, app, scheduler${mode === "caddy" ? ", Caddy" : ""}`;
  const localPort = String(requestedPort);
  p3.note(
    [
      `Directory   ${directory}`,
      `URL         ${url.origin}`,
      `Image       ${image}`,
      `Services    ${services}`,
      `Ports       ${mode === "caddy" ? "80, 443" : `127.0.0.1:${localPort}`}`,
      `Storage     ${storage === "local" ? "Local persistent volume" : "S3-compatible"}`,
      `Resources   ${resourceProfile}`,
      `HTTPS       ${mode === "caddy" ? "Managed automatically by Caddy" : mode === "external" ? "Managed by external proxy" : "Disabled"}`
    ].join("\n"),
    "Installation plan"
  );
  const approved = unwrapPrompt(
    await p3.confirm({
      message: "Generate this installation?",
      initialValue: true
    })
  );
  if (!approved) {
    p3.cancel("No files were changed.");
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
    image
  };
}
async function atomicWrite(file, contents, mode) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process3.pid}-${randomBytes(4).toString("hex")}`;
  await writeFile(temp, contents, { mode });
  await rename(temp, file);
  if (mode) await chmod(file, mode);
}
async function exists(file) {
  return stat(file).then(
    () => true,
    () => false
  );
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
METRICS_TOKEN=<independent-secret>
HARLY_SETUP_SECRET=<secret>
HARLY_INITIAL_ADMIN_EMAIL=owner@example.com
STORAGE_PROVIDER=local
RESEND_API_KEY=
EMAIL_FROM=
# Optional resource tuning (defaults target a 4 GB VPS)
HARLY_APP_MEMORY=1536m
HARLY_POSTGRES_MEMORY=768m
HARLY_SCHEDULER_MEMORY=256m
HARLY_SCHEDULER_STALE_AFTER_SECONDS=300
HARLY_CADDY_MEMORY=256m
HARLY_CACHE_MAX_MB=512
HARLY_CACHE_MAX_AGE_DAYS=7
HARLY_LOG_MAX_SIZE=10m
HARLY_LOG_MAX_FILES=3
`;
var envExampleWithEsign = `${envExample}# Optional DocuSeal global fallback (per-workspace config in Settings overrides)
DOCUSEAL_URL=
DOCUSEAL_API_TOKEN=
# Set only when running the bundled DocuSeal service (--profile esign)
DOCUSEAL_SECRET_KEY_BASE=
`;
async function init() {
  const directory = path.resolve(positionals[0] ?? "harly");
  const dryRun = flags.has("--dry-run");
  const answers = interactive ? await collectInteractiveAnswers(directory) : await collectNonInteractiveAnswers(directory);
  const {
    mode,
    url,
    port,
    email,
    organization,
    storage,
    s3,
    resourceProfile,
    image
  } = answers;
  const resources = resourceProfiles[resourceProfile];
  const generationSpinner = interactive && !dryRun ? p3.spinner(spinnerStyle) : null;
  if (!dryRun) generationSpinner?.start("Generating secure configuration");
  let setupSecret2;
  let envWritten = false;
  const wouldCreate = [];
  try {
    await mkdir(directory, { recursive: true });
    const envPath = path.join(directory, ".env");
    if (!await exists(envPath)) {
      setupSecret2 = secret();
      const env = [
        `HARLY_IMAGE=${envLine(image)}`,
        `HARLY_VERSION=${envLine(image.includes("@sha256:") ? "digest" : image.split(":").at(-1) ?? "unknown")}`,
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
        `HARLY_SETUP_SECRET=${envLine(setupSecret2)}`,
        `HARLY_INITIAL_ADMIN_EMAIL=${envLine(email)}`,
        "DOCUSEAL_URL=",
        "DOCUSEAL_API_TOKEN=",
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
        "HARLY_SCHEDULER_STALE_AFTER_SECONDS=300",
        `HARLY_CADDY_MEMORY=${resources.caddy}`,
        `HARLY_CACHE_MAX_MB=${resources.cacheMb}`,
        "HARLY_CACHE_MAX_AGE_DAYS=7",
        "HARLY_LOG_MAX_SIZE=10m",
        "HARLY_LOG_MAX_FILES=3",
        ""
      ].join("\n");
      if (dryRun) {
        wouldCreate.push(".env (mode 0600, contains random secrets)");
      } else {
        await atomicWrite(envPath, env, 384);
        const stat_ = await stat(envPath);
        if ((stat_.mode & 511) !== 384) await chmod(envPath, 384);
        envWritten = true;
      }
    }
    const config = {
      version: 1,
      proxyMode: mode,
      publicUrl: url.origin,
      image,
      organizationName: organization,
      initialAdminEmail: email,
      storage,
      resourceProfile
    };
    const templates = [
      ["compose.yaml", composeTemplate],
      [
        "Caddyfile",
        "{$HARLY_DOMAIN} {\n  encode zstd gzip\n  reverse_proxy app:3000\n}\n"
      ],
      [".env.example", envExampleWithEsign],
      [".gitignore", ".env\nbackups/\n"],
      ["harly.config.json", `${JSON.stringify(config, null, 2)}
`],
      [
        "README.md",
        `# Harly self-host

Before launching Caddy, make sure ${url.hostname} has an A record pointing to this VPS and that TCP 80/443 plus UDP 443 are allowed by the firewall. If another reverse proxy owns those ports, use external proxy mode and forward it to 127.0.0.1:3000.

- Open management: \`npx @harly/cli\`
- Diagnose: \`npx @harly/cli doctor\`
- Backup before every update.
- Complete the first owner at ${url.origin}/setup using HARLY_SETUP_SECRET from .env.
`
      ]
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
      `  ${ink("Dry run \u2014 no files were written.")}`,
      "",
      `  ${header}`,
      ...wouldCreate.map((name) => `    ${accent("+")} ${name}`),
      ""
    ];
    process3.stdout.write(`${lines.join("\n")}
`);
    if (interactive) p3.outro("Re-run without --dry-run to write these files.");
    return;
  }
  generationSpinner?.stop("Configuration generated");
  if (interactive) {
    p3.log.success(`${pc2.bold(directory)} is ready`);
    const launchNow = unwrapPrompt(
      await p3.confirm({
        message: "Pull the image and launch Harly now?",
        initialValue: true
      })
    );
    if (launchNow) {
      await launch(directory, true);
      printInstallOutro({
        url: url.origin,
        email,
        mode,
        setupSecret: setupSecret2 ?? "",
        envWritten,
        directory
      });
    } else {
      p3.outro(
        `Next: ${accent(`cd ${shellQuote(directory)} && npx @harly/cli`)}`
      );
      if (setupSecret2) {
        process3.stdout.write(
          `
Setup secret (copy and keep it safe \u2014 you will need it at ${url.origin}/setup):
  ${accent(setupSecret2)}

`
        );
      }
    }
  } else {
    process3.stdout.write(
      `
Generated ${directory}
Image: ${image}
Mode: ${mode}
Resource profile: ${resourceProfile}
Services: postgres, migrate, app, scheduler${mode === "caddy" ? ", caddy" : ""}
Volumes: postgres-data, uploads, next-cache${mode === "caddy" ? ", caddy-data, caddy-config" : ""}
`
    );
    if (setupSecret2) {
      process3.stdout.write(
        `
Setup secret: ${setupSecret2}
Use it at ${url.origin}/setup to claim the owner account.

`
      );
    } else {
      process3.stdout.write("\n");
    }
  }
}
function printInstallOutro(args2) {
  const { url, email, mode, setupSecret: setupSecret2, envWritten, directory } = args2;
  p3.log.success(`Harly is running at ${accent(url)}`);
  const lines = [];
  if (setupSecret2) {
    lines.push("");
    lines.push(`To finish setup, open ${accent(url)} and enter the secret below:`);
    lines.push("");
    lines.push(`  ${accent(setupSecret2)}`);
    lines.push("");
    lines.push(
      `Then sign in as ${accent(email)}. The secret is also in ${accent(`${directory}/.env`)} (line HARLY_SETUP_SECRET) for later reference.`
    );
  } else if (envWritten) {
    lines.push("");
    lines.push(
      `Open ${accent(url)} to finish setup. The setup secret is in ${accent(`${directory}/.env`)} (HARLY_SETUP_SECRET).`
    );
  } else {
    lines.push("");
    lines.push(`Open ${accent(url)} to finish setup.`);
  }
  lines.push("");
  lines.push("After setup:");
  lines.push(`  ${accent("harly doctor")}   verify the public route`);
  lines.push(`  ${accent("harly backup")}   write a private rollback point`);
  lines.push(`  ${accent("harly update")}   apply future upgrades safely`);
  if (mode === "caddy") {
    lines.push("");
    lines.push(
      soft(
        "If HTTPS does not load, check that TCP 80/443 and UDP 443 are open in the cloud security group."
      )
    );
  }
  p3.outro(lines.join("\n"));
}
function renderHostCheck(host, options = {}) {
  const rows = [];
  rows.push({
    label: "Host",
    status: "ok",
    detail: `${host.distro}, ${host.cpuCount} CPU, ${host.freeMemoryGb.toFixed(1)} GB free of ${host.memoryGb.toFixed(1)} GB`
  });
  if (host.docker) {
    rows.push({
      label: "Docker",
      status: "ok",
      detail: `Engine ${host.docker.engine} (need \u2265 24)`
    });
    rows.push({
      label: "Compose",
      status: "ok",
      detail: `${host.docker.compose} (need \u2265 2.20)`
    });
  } else {
    rows.push({
      label: "Docker",
      status: "fail",
      detail: "missing",
      fix: "Install Docker Engine 24+"
    });
  }
  const requiredDiskGb = Number(process3.env.HARLY_REQUIRED_DISK_GB ?? 5);
  rows.push({
    label: "Disk",
    status: host.diskGb >= requiredDiskGb ? "ok" : "fail",
    detail: `${host.diskGb.toFixed(1)} GB free`,
    ...host.diskGb < requiredDiskGb ? { fix: `Free at least ${requiredDiskGb} GB on the install path` } : {}
  });
  if (host.firewall) {
    rows.push({
      label: "Firewall",
      status: "warn",
      detail: host.firewall.detail,
      fix: `Run: ${host.firewall.fix}`
    });
  }
  for (const port of options.ports ?? []) {
    rows.push({ label: `Port ${port.port}`, status: "warn", detail: port.detail });
  }
  const labelWidth = Math.max(...rows.map((row) => row.label.length));
  const glyph = (status) => status === "ok" ? accent("\u2713") : status === "warn" ? pc2.yellow("\u26A0") : pc2.red("\u2717");
  const lines = ["", `  ${ink("Harly self-host requirements")}`, ""];
  for (const row of rows) {
    lines.push(
      `  ${glyph(row.status)} ${row.label.padEnd(labelWidth)}  ${row.detail}`
    );
    if (row.fix) lines.push(`  ${" ".repeat(labelWidth + 4)}${soft(row.fix)}`);
  }
  return lines.join("\n");
}
async function harlyCheck(directory = process3.cwd()) {
  const spinner4 = interactive ? p3.spinner(spinnerStyle) : null;
  spinner4?.start("Checking host");
  const host = await preflightHost(directory);
  spinner4?.stop("Host checked");
  const portChecks = [];
  for (const portSpec of [80, 443]) {
    const available = await portAvailable(portSpec);
    if (!available) {
      const owner = portOwner(portSpec, "tcp");
      portChecks.push({
        port: portSpec,
        protocol: "tcp",
        detail: owner ? `busy (${owner})` : "busy"
      });
    }
  }
  const output = renderHostCheck(host, { ports: portChecks });
  process3.stdout.write(`${output}

`);
  const requiredDiskGb = Number(process3.env.HARLY_REQUIRED_DISK_GB ?? 5);
  const allOk = !host.firewall && portChecks.length === 0 && host.diskGb >= requiredDiskGb;
  if (interactive) {
    if (allOk) {
      p3.log.success("Your host is ready. Run `harly init` to install Harly.");
    } else {
      p3.log.warn("Some checks need attention. Resolve them above, then run `harly init`.");
    }
  } else {
    if (!allOk) process3.exitCode = 1;
  }
}
async function setupSecret(explicitDirectory) {
  const directory = path.resolve(
    explicitDirectory ?? positionals[0] ?? process3.cwd()
  );
  let envPath = path.join(directory, ".env");
  if (!await exists(envPath)) {
    const installation = await findInstallation(directory);
    if (!installation) {
      throw new CliError(
        `No .env file found at ${envPath}. Run \`harly init\` first.`,
        1
      );
    }
    envPath = path.join(installation.directory, ".env");
  }
  let env;
  try {
    env = await readFile(envPath, "utf8");
  } catch {
    throw new CliError(`Cannot read ${envPath}. Check file permissions.`, 1);
  }
  const match = env.match(/^HARLY_SETUP_SECRET=(?:"([^"]+)"|(\S+))$/m);
  if (!match) {
    throw new CliError(
      `HARLY_SETUP_SECRET is missing from ${envPath}. The install may be incomplete.`,
      1
    );
  }
  const secret2 = match[1] ?? match[2] ?? "";
  if (!secret2) {
    throw new CliError(`HARLY_SETUP_SECRET is empty in ${envPath}.`, 1);
  }
  process3.stdout.write(`${secret2}
`);
}
async function readConfig(directory) {
  try {
    return JSON.parse(
      await readFile(path.join(directory, "harly.config.json"), "utf8")
    );
  } catch {
    throw new CliError(
      "harly.config.json is missing or invalid. Run init first."
    );
  }
}
async function findInstallation(start = process3.cwd()) {
  let directory = path.resolve(start);
  while (true) {
    const configPath = path.join(directory, "harly.config.json");
    if (await exists(configPath)) {
      try {
        return { directory, config: await readConfig(directory) };
      } catch {
        throw new CliError(
          `Found an invalid Harly configuration at ${configPath}. Fix or remove it before starting a new installation.`,
          2
        );
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}
async function waitForService(cwd, service, timeoutMs) {
  const isOneShot = service === "migrate";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = run(
      "docker",
      ["compose", "ps", "-a", "--format", "json", service],
      { cwd, allowFailure: true }
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
                  detail: `exited ${item.ExitCode ?? "?"}`
                };
              }
            }
          }
        } catch {
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
  }
  return { ready: false, detail: "timeout" };
}
function formatLaunchLine(service, ready, detail, elapsedSec) {
  const glyph = ready ? accent("\u2713") : pc2.red("\u2717");
  const label = ready ? `${service} ready` : `${service} ${detail}`;
  return `  ${glyph} ${label.padEnd(28)} ${soft(`\xB7 ${elapsedSec.toFixed(1)}s`)}`;
}
async function launch(explicitDirectory, confirmed = false) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  if (interactive && !confirmed) {
    showBrand("Launch", cliVersion);
    p3.note(
      `Image  ${config.image}
Mode   ${config.proxyMode}
URL    ${config.publicUrl}`,
      "Launch plan"
    );
  } else if (!interactive) {
    process3.stdout.write(
      `Image: ${config.image}
Mode: ${config.proxyMode}
Commands: docker compose pull; docker compose up -d --wait
`
    );
  }
  if (!confirmed && !yes && !await confirm2("Continue?")) {
    if (!process3.stdin.isTTY)
      throw new CliError("--yes is required in non-interactive mode.", 2);
    throw new CliError("Launch cancelled.", 2);
  }
  progressStep(
    "Validating Docker Compose",
    "Compose configuration is valid",
    () => compose(directory, ["config", "--quiet"])
  );
  await pullWithProgress(directory, [], interactive);
  compose(directory, ["up", "-d"], { allowFailure: false });
  const ordered = ["postgres"];
  if (config.proxyMode === "caddy") ordered.push("caddy");
  ordered.push("migrate", "app", "scheduler");
  const results = [];
  for (const service of ordered) {
    const step = interactive ? p3.spinner(spinnerStyle) : null;
    const start = Date.now();
    if (interactive) {
      step?.start(`Waiting for ${service}`);
    } else {
      process3.stdout.write(`  \u2026 ${service}
`);
    }
    const result = await waitForService(directory, service, 9e4);
    const elapsedSec = (Date.now() - start) / 1e3;
    if (interactive) {
      const line = formatLaunchLine(service, result.ready, result.detail, elapsedSec);
      step?.stop(line);
    } else {
      process3.stdout.write(
        `${formatLaunchLine(service, result.ready, result.detail, elapsedSec)}
`
      );
    }
    results.push({ service, ready: result.ready, elapsedSec, detail: result.detail });
  }
  let publicOk = false;
  try {
    const response = await fetch(`${config.publicUrl}/api/health/ready`, {
      signal: AbortSignal.timeout(5e3)
    });
    publicOk = response.ok;
  } catch {
    publicOk = false;
  }
  if (interactive) {
    const glyph = publicOk ? accent("\u2713") : pc2.yellow("\u26A0");
    const label = publicOk ? `Public URL ready (HTTP 200)` : `Public URL not reachable yet`;
    process3.stdout.write(
      `  ${glyph} ${label.padEnd(28)} ${soft(`\xB7 ${config.publicUrl}`)}
`
    );
  } else {
    process3.stdout.write(
      `${formatLaunchLine(
        "public",
        publicOk,
        publicOk ? "ready" : "not reachable",
        0
      )} ${soft(config.publicUrl)}
`
    );
  }
  const allReady = results.every((r) => r.ready);
  if (!allReady) {
    throw new CliError(
      `One or more services did not become healthy:
${results.filter((r) => !r.ready).map((r) => `  - ${r.service}: ${r.detail}`).join("\n")}
Run \`harly doctor ${directory}\` to inspect.`,
      1
    );
  }
  if (interactive && !confirmed) {
    p3.outro(
      `Harly is ready at ${accent(config.publicUrl)} \xB7 run ${accent("harly doctor")}`
    );
  } else if (!interactive) {
    process3.stdout.write(
      `Harly is ready at ${config.publicUrl}. Run \`harly doctor\` to verify.
`
    );
  }
}
async function runDoctorFix(directory, config) {
  if (!interactive) {
    p3.log.warn("--fix requires an interactive terminal.");
    return;
  }
  const servicesResult = compose(
    directory,
    ["ps", "--status", "running", "--services"],
    { allowFailure: true }
  );
  const running = String(servicesResult.stdout ?? "").trim().split(/\s+/).filter(Boolean);
  const expected = ["postgres", "app", "scheduler", ...config.proxyMode === "caddy" ? ["caddy"] : []];
  const stopped = expected.filter((name) => !running.includes(name));
  if (stopped.length === 0) {
    p3.log.info("All expected services are running. Nothing to restart.");
    return;
  }
  const action = unwrapPrompt(
    await p3.select({
      message: `${stopped.join(", ")} ${stopped.length === 1 ? "is" : "are"} not running. What do you want to do?`,
      options: [
        { value: "restart", label: `Restart ${stopped.join(", ")}`, hint: "docker compose restart <service>" },
        { value: "up", label: "Bring everything up", hint: "docker compose up -d" },
        { value: "logs", label: "Show container logs first", hint: "docker compose logs --tail=100 <service>" },
        { value: "abort", label: "Cancel" }
      ]
    })
  );
  if (p3.isCancel(action) || action === "abort") return;
  if (action === "logs") {
    p3.log.info("Inspect logs with: docker compose logs --tail=100 " + stopped[0]);
    return;
  }
  if (action === "restart") {
    const spin = p3.spinner(spinnerStyle);
    spin.start(`Restarting ${stopped.join(", ")}`);
    compose(directory, ["restart", ...stopped]);
    spin.stop(`Restart issued. Run \`harly doctor\` to verify.`);
    return;
  }
  if (action === "up") {
    const spin = p3.spinner(spinnerStyle);
    spin.start("Starting services");
    compose(directory, ["up", "-d"]);
    spin.stop("Services started. Run `harly doctor` to verify.");
  }
}
async function doctor(explicitDirectory, print = true) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  const checks = [];
  const valid = compose(directory, ["config", "--quiet"], {
    allowFailure: true
  });
  checks.push({
    name: "compose",
    label: "Compose file is valid",
    ok: valid.status === 0
  });
  const servicesResult = compose(
    directory,
    ["ps", "--status", "running", "--services"],
    { allowFailure: true }
  );
  const services = String(servicesResult.stdout ?? "").trim().split(/\s+/).filter(Boolean);
  const serviceLabels = {
    postgres: "Database is running",
    app: "Application is running",
    scheduler: "Scheduler is running",
    caddy: "HTTPS proxy is running"
  };
  for (const name of [
    "postgres",
    "app",
    "scheduler",
    ...config.proxyMode === "caddy" ? ["caddy"] : []
  ])
    checks.push({
      name: `service:${name}`,
      label: serviceLabels[name] ?? `${name} is running`,
      ok: services.includes(name)
    });
  checks.push({
    name: "profile:caddy",
    label: config.proxyMode === "caddy" ? "Proxy profile matches this installation" : "No stray proxy is running",
    ok: config.proxyMode === "caddy" ? services.includes("caddy") : !services.includes("caddy")
  });
  try {
    const response = await fetch(`${config.publicUrl}/api/health/ready`, {
      signal: AbortSignal.timeout(5e3)
    });
    checks.push({
      name: "readiness",
      label: "Public URL answers as ready",
      ok: response.ok,
      detail: `HTTP ${response.status}`
    });
  } catch {
    checks.push({
      name: "readiness",
      label: "Public URL answers as ready",
      ok: false,
      detail: "unreachable"
    });
  }
  const result = {
    ok: checks.every((check) => check.ok),
    proxyMode: config.proxyMode,
    image: config.image,
    checks
  };
  if (print)
    process3.stdout.write(
      json ? `${JSON.stringify(result)}
` : `
${checks.map(
        (check) => `  ${check.ok ? accent("\u2713") : pc2.red("\u2717")} ${check.label}${check.detail ? ` ${soft(`\xB7 ${check.detail}`)}` : ""}  ${soft(check.name)}`
      ).join("\n")}

  ${result.ok ? accent("Harly is healthy.") : pc2.red("Harly needs attention.")}

`
    );
  if (!result.ok && print) process3.exitCode = 1;
  if (!result.ok && flags.has("--fix") && interactive && !json) {
    await runDoctorFix(directory, config);
  }
  return result;
}
function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
async function checksums(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = {};
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
async function deploymentEnvironment(directory) {
  const contents = await readFile(path.join(directory, ".env"), "utf8");
  const values = /* @__PURE__ */ new Map();
  for (const line of contents.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    try {
      values.set(match[1], JSON.parse(match[2]));
    } catch {
      values.set(match[1], match[2]);
    }
  }
  return values;
}
async function deploymentDatabase(directory) {
  const values = await deploymentEnvironment(directory);
  return {
    user: values.get("POSTGRES_USER") || "harly",
    database: values.get("POSTGRES_DB") || "harly"
  };
}
async function backup(explicitDirectory) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  const database = await deploymentDatabase(directory);
  const recipient = process3.env.AGE_RECIPIENT ?? (await deploymentEnvironment(directory)).get("AGE_RECIPIENT");
  const encrypt = flags.has("--encrypt");
  if (encrypt && !recipient)
    throw new CliError(
      "--encrypt requires AGE_RECIPIENT. See the advanced encryption guide."
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
        "-Fc"
      ],
      { binary: true }
    );
    const bytes = Buffer.isBuffer(dump.stdout) ? dump.stdout : Buffer.from(dump.stdout);
    await writeFile(path.join(temp, "database.dump"), bytes);
    await cp(path.join(directory, ".env"), path.join(temp, ".env"));
    await cp(
      path.join(directory, "harly.config.json"),
      path.join(temp, "harly.config.json")
    );
    if (config.storage === "local")
      compose(directory, [
        "cp",
        "app:/data/uploads/.",
        path.join(temp, "uploads")
      ]);
    const manifest = {
      version: config.image,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      storage: config.storage,
      uploads: config.storage === "local" ? "included" : "external-s3-not-included",
      files: await checksums(temp)
    };
    await writeFile(
      path.join(temp, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}
`
    );
    const archive = path.join(
      outputDirectory,
      `harly-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.tar.gz`
    );
    run("tar", ["-czf", archive, "-C", temp, "."]);
    await chmod(archive, 384);
    if (!encrypt) {
      process3.stdout.write(`${archive}
`);
      return archive;
    }
    const encrypted = `${archive}.age`;
    run("age", ["-r", recipient, "-o", encrypted, archive]);
    await chmod(encrypted, 384);
    await rm(archive, { force: true });
    process3.stdout.write(`${encrypted}
`);
    return encrypted;
  } finally {
    compose(directory, ["up", "-d", "app", "scheduler"], {
      allowFailure: true
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
      2
    );
  const archive = path.resolve(archiveArg);
  const directory = path.resolve(positionals[1] ?? ".");
  const config = await readConfig(directory);
  const database = await deploymentDatabase(directory);
  const temp = await mkdtemp(path.join(os.tmpdir(), "harly-restore-"));
  let plaintext = archive;
  if (archive.endsWith(".age")) {
    plaintext = path.join(temp, "backup.tar.gz");
    const identity = process3.env.AGE_IDENTITY;
    if (!identity)
      throw new CliError("AGE_IDENTITY is required to decrypt this backup.");
    run("age", ["-d", "-i", identity, "-o", plaintext, archive]);
  }
  run("tar", ["-xzf", plaintext, "-C", temp]);
  const manifest = JSON.parse(
    await readFile(path.join(temp, "manifest.json"), "utf8")
  );
  const actual = await checksums(temp);
  for (const [file, checksum] of Object.entries(manifest.files)) {
    if (actual[file] !== checksum)
      throw new CliError(`Backup checksum verification failed for ${file}.`);
  }
  if (manifest.storage === "s3" || config.storage === "s3") {
    process3.stderr.write(
      "This backup does not include S3 objects. Verify the bucket backup/version history before restoring.\n"
    );
  }
  process3.stdout.write("Creating a safety backup of the current deployment\u2026\n");
  await backup(directory);
  process3.stdout.write("Safety backup saved. Preparing restore\u2026\n");
  compose(directory, ["stop", "app", "scheduler", "migrate"], {
    allowFailure: true
  });
  try {
    process3.stdout.write("Restoring database\u2026\n");
    compose(directory, [
      "cp",
      path.join(temp, "database.dump"),
      "postgres:/tmp/harly-restore.dump"
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
      "/tmp/harly-restore.dump"
    ]);
    compose(
      directory,
      ["exec", "-T", "postgres", "rm", "-f", "/tmp/harly-restore.dump"],
      { allowFailure: true }
    );
    if (await exists(path.join(temp, "uploads"))) {
      process3.stdout.write("Restoring local uploads\u2026\n");
      compose(directory, [
        "run",
        "--rm",
        "--entrypoint",
        "sh",
        "app",
        "-c",
        "rm -rf /data/uploads/* /data/uploads/.[!.]* /data/uploads/..?*"
      ]);
      compose(directory, [
        "cp",
        `${path.join(temp, "uploads")}/.`,
        "app:/data/uploads"
      ]);
    }
    process3.stdout.write("Applying migrations\u2026\n");
    compose(directory, ["run", "--rm", "migrate"]);
  } finally {
    compose(directory, ["up", "-d", "app", "scheduler"], {
      allowFailure: true
    });
  }
  const result = await doctor(directory, false);
  if (!result.ok)
    throw new CliError(
      "Restore completed but Harly did not become healthy. Your safety backup was preserved; run `harly doctor` and inspect `docker compose logs` before retrying."
    );
  process3.stdout.write("Restore complete. Harly is healthy.\n");
}
async function upgrade(explicitDirectory) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  await preflight(config.proxyMode, false);
  if (toVersion === "latest")
    throw new CliError(
      "latest is not allowed. Use edge for previews or a fixed version.",
      2
    );
  const requestedImage = toVersion ? toVersion.startsWith("ghcr.io/") ? toVersion : `ghcr.io/vytral/harly:${toVersion}` : config.requestedImage ?? config.image;
  if (!yes && !await confirm2(
    `Back up and upgrade ${config.image} to ${requestedImage}?`
  )) {
    if (!interactive)
      throw new CliError("--yes is required in non-interactive mode.", 2);
    throw new CliError("Upgrade cancelled.", 2);
  }
  if (interactive) {
    showBrand("Update", cliVersion);
    p3.note(
      `Current  ${config.image}
Target   ${requestedImage}
Data     preserved`,
      "Upgrade plan"
    );
  }
  await backup(directory);
  const envPath = path.join(directory, ".env");
  const configPath = path.join(directory, "harly.config.json");
  const originalEnv = await readFile(envPath, "utf8");
  const setImage = (contents, image, version) => contents.replace(/^HARLY_IMAGE=.*$/m, `HARLY_IMAGE=${envLine(image)}`).replace(/^HARLY_VERSION=.*$/m, `HARLY_VERSION=${envLine(version)}`);
  let migrationsAttempted = false;
  await atomicWrite(
    envPath,
    setImage(originalEnv, requestedImage, toVersion ?? "current"),
    384
  );
  try {
    await pullWithProgress(
      directory,
      ["app", "migrate", "scheduler"],
      interactive
    );
  } catch (error) {
    await atomicWrite(envPath, originalEnv, 384);
    throw error;
  }
  const inspected = run(
    "docker",
    [
      "image",
      "inspect",
      requestedImage,
      "--format",
      '{{join .RepoDigests "\\n"}}'
    ],
    { allowFailure: true }
  );
  const repository = requestedImage.split("@")[0].replace(/:[^/:]+$/, "");
  const digest = String(inspected.stdout ?? "").split(/\s+/).find((value) => value.startsWith(`${repository}@sha256:`));
  const deployedImage = digest ?? requestedImage;
  const deployedVersion = deployedImage.includes("@sha256:") ? deployedImage.split("@sha256:")[1].slice(0, 12) : toVersion ?? "current";
  await atomicWrite(
    envPath,
    setImage(await readFile(envPath, "utf8"), deployedImage, deployedVersion),
    384
  );
  const markTargetConfigured = async () => {
    config.requestedImage = requestedImage;
    config.image = deployedImage;
    config.deployedAt = (/* @__PURE__ */ new Date()).toISOString();
    await atomicWrite(configPath, `${JSON.stringify(config, null, 2)}
`);
  };
  try {
    migrationsAttempted = true;
    progressStep(
      "Applying database migrations",
      "Migrations applied",
      () => compose(directory, ["run", "--rm", "migrate"])
    );
    progressStep(
      "Recreating services and waiting for healthchecks",
      "Services are healthy",
      () => {
        compose(directory, ["up", "-d", "--wait", "--wait-timeout", "180"]);
      }
    );
  } catch (error) {
    if (migrationsAttempted) await markTargetConfigured();
    else await atomicWrite(envPath, originalEnv, 384);
    throw error;
  }
  await markTargetConfigured();
  let result = await doctor(directory, false);
  for (let attempt = 0; !result.ok && attempt < 15; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    result = await doctor(directory, false);
  }
  if (result.ok) await doctor(directory);
  if (!result.ok)
    throw new CliError(
      "Upgrade completed but health checks failed. The new image remains selected because migrations are forward-only; restore the pre-upgrade backup if recovery is required."
    );
  if (interactive)
    p3.outro(
      `Harly is running ${accent(deployedImage)} at ${accent(config.publicUrl)}`
    );
}
async function uninstall(explicitDirectory) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  await readConfig(directory);
  if (!yes && !await confirm2(
    "Stop Harly and remove its containers? Data volumes will be kept."
  )) {
    throw new CliError("Uninstall cancelled.", 2);
  }
  if (flags.has("--remove-data")) {
    if (!yes && !await confirm2(
      "Permanently delete PostgreSQL, uploads, cache, and proxy volumes?"
    )) {
      compose(directory, ["down"]);
      process3.stdout.write("Containers removed; data volumes kept.\n");
      return;
    }
    process3.stdout.write(
      "Creating a final backup before deleting data volumes.\n"
    );
    await backup(directory);
    compose(directory, ["down", "--volumes"]);
    process3.stdout.write(
      "Harly containers and data volumes were removed. Local backup archives were kept.\n"
    );
  } else {
    compose(directory, ["down"]);
    process3.stdout.write(
      "Harly containers were removed. PostgreSQL, uploads, and backups were kept.\n"
    );
  }
}
async function railwayGuide() {
  showBrand("Railway", cliVersion);
  const token = unwrapPrompt(
    await p3.password({
      message: "Railway API token (from railway.app/account/tokens)",
      validate: (value) => value?.trim() ? void 0 : "Required."
    })
  );
  const projectName = unwrapPrompt(
    await p3.text({ message: "Railway project name", initialValue: "harly" })
  );
  const email = unwrapPrompt(
    await p3.text({ message: "Initial owner email", validate: validateEmail })
  ).toLowerCase();
  const bucket = unwrapPrompt(
    await p3.text({
      message: "S3-compatible bucket (required for cloud uploads)",
      validate: (value) => value?.trim() ? void 0 : "S3 storage is required on cloud platforms."
    })
  );
  const region = unwrapPrompt(
    await p3.text({ message: "S3 region", initialValue: "auto" })
  );
  const accessKey = unwrapPrompt(
    await p3.password({
      message: "S3 access key",
      validate: (value) => value ? void 0 : "Required."
    })
  );
  const secretKey = unwrapPrompt(
    await p3.password({
      message: "S3 secret key",
      validate: (value) => value ? void 0 : "Required."
    })
  );
  const deploymentRelease = await officialRelease();
  const image = releaseImage(deploymentRelease);
  const runtimeSecrets = {
    betterAuth: secret(),
    aiEncryption: secret(),
    storageUpload: secret(),
    cron: secret(),
    setup: secret()
  };
  const postgresPassword = secret();
  const spin = p3.spinner(spinnerStyle);
  spin.start("Creating Railway project");
  const { projectId, environmentId } = await railwayCreateProject(
    token,
    projectName
  );
  spin.message("Provisioning managed PostgreSQL");
  const postgresServiceId = await railwayCreateService(
    token,
    projectId,
    "postgres",
    "ghcr.io/railwayapp-templates/postgres-ssl:latest"
  );
  await railwayCreateVolume(
    token,
    projectId,
    environmentId,
    postgresServiceId,
    "/var/lib/postgresql/data"
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
      PGDATA: "/var/lib/postgresql/data/pgdata"
    }
  );
  const databaseUrl = `postgresql://postgres:${postgresPassword}@postgres.railway.internal:5432/railway`;
  spin.message("Creating web service");
  const webServiceId = await railwayCreateService(
    token,
    projectId,
    "web",
    image
  );
  await railwayUpdateInstance(token, environmentId, webServiceId, {
    healthcheckPath: "/api/health/ready",
    restartPolicyType: "ON_FAILURE"
  });
  const domain = await railwayCreateDomain(token, environmentId, webServiceId);
  const url = normalizeUrl(`https://${domain}`, "external");
  spin.message("Creating scheduler service");
  const schedulerServiceId = await railwayCreateService(
    token,
    projectId,
    "scheduler",
    image
  );
  await railwayUpdateInstance(token, environmentId, schedulerServiceId, {
    startCommand: "node /app/runtime.mjs scheduler",
    restartPolicyType: "ON_FAILURE"
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
    S3_SECRET_ACCESS_KEY: secretKey
  };
  spin.message("Setting environment variables");
  await railwaySetVariables(
    token,
    projectId,
    environmentId,
    webServiceId,
    sharedEnv
  );
  await railwaySetVariables(
    token,
    projectId,
    environmentId,
    schedulerServiceId,
    sharedEnv
  );
  spin.message("Running database migrations");
  const migrateServiceId = await railwayCreateService(
    token,
    projectId,
    "migrate",
    image
  );
  await railwayUpdateInstance(token, environmentId, migrateServiceId, {
    startCommand: "node /app/runtime.mjs migrate",
    numReplicas: 0
  });
  await railwaySetVariables(token, projectId, environmentId, migrateServiceId, {
    DATABASE_URL: databaseUrl
  });
  await railwayDeploy(token, environmentId, migrateServiceId);
  spin.message("Deploying web and scheduler");
  await railwayDeploy(token, environmentId, webServiceId);
  await railwayDeploy(token, environmentId, schedulerServiceId);
  spin.stop("Railway project provisioned");
  const directory = path.resolve("harly-railway");
  await mkdir(directory, { recursive: true });
  const env = Object.entries(sharedEnv).map(([key, value]) => `${key}=${envLine(value)}`).join("\n") + "\n";
  await atomicWrite(path.join(directory, ".env"), env, 384);
  p3.note(
    `Project    ${projectName} (${projectId})
URL        ${url.origin}
Image      ${image}
Secrets    ${path.join(directory, ".env")} (mode 0600, local record only)

The migrate service ran once and can be deleted from the Railway dashboard once its deployment succeeds. Watch build/deploy logs at railway.app; the web and scheduler services redeploy automatically on future \`git push\` if you later connect a GitHub repo.`,
    "Railway deployment provisioned"
  );
  p3.outro(
    `Harly is deploying to ${accent(url.origin)}. Never commit the generated .env file.`
  );
}
async function cloudGuide(provider) {
  const providerName = provider === "fly" ? "Fly.io" : "DigitalOcean";
  showBrand(providerName, cliVersion);
  const url = normalizeUrl(
    unwrapPrompt(
      await p3.text({
        message: "Public URL",
        placeholder: "https://hiring.example.com",
        validate: validatePublicOrigin
      })
    ),
    "external"
  );
  const email = unwrapPrompt(
    await p3.text({ message: "Initial owner email", validate: validateEmail })
  ).toLowerCase();
  const bucket = unwrapPrompt(
    await p3.text({
      message: "S3-compatible bucket (required for cloud uploads)",
      validate: (value) => value?.trim() ? void 0 : "S3 storage is required on cloud platforms."
    })
  );
  const region = unwrapPrompt(
    await p3.text({ message: "S3 region", initialValue: "auto" })
  );
  const accessKey = unwrapPrompt(
    await p3.password({
      message: "S3 access key",
      validate: (value) => value ? void 0 : "Required."
    })
  );
  const secretKey = unwrapPrompt(
    await p3.password({
      message: "S3 secret key",
      validate: (value) => value ? void 0 : "Required."
    })
  );
  const databaseUrl = provider === "digitalocean" ? unwrapPrompt(
    await p3.password({
      message: "DigitalOcean Managed PostgreSQL connection URL",
      validate: validateDatabaseUrl
    })
  ) : void 0;
  const directory = path.resolve(`harly-${provider}`);
  await mkdir(directory, { recursive: true });
  const runtimeSecrets = {
    betterAuth: secret(),
    aiEncryption: secret(),
    storageUpload: secret(),
    cron: secret(),
    setup: secret()
  };
  const env = [
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
    ...databaseUrl ? [`DATABASE_URL=${envLine(databaseUrl)}`] : []
  ].join("\n") + "\n";
  await atomicWrite(path.join(directory, ".env"), env, 384);
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
`
    );
  }
  if (provider === "digitalocean") {
    const yaml = (value) => JSON.stringify(value);
    const secretEnv = (key, value) => `  - { key: ${key}, scope: RUN_TIME, type: SECRET, value: ${yaml(value)} }`;
    const publicEnv = (key, value) => `  - { key: ${key}, scope: RUN_TIME, type: GENERAL, value: ${yaml(value)} }`;
    const appSpec = [
      "# Generated by the Harly CLI. This file contains secrets: keep it outside Git.",
      "name: harly",
      "region: nyc",
      "",
      "envs:",
      secretEnv("DATABASE_URL", databaseUrl),
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
      ""
    ].join("\n");
    await atomicWrite(path.join(directory, "app.yaml"), appSpec, 384);
  }
  const next = provider === "fly" ? `Run \`fly launch --no-deploy\` in ${shellQuote(directory)}, attach Managed Postgres, import .env as Fly secrets, then run \`fly deploy\`.` : `The generated app spec already includes your Managed PostgreSQL URL as an encrypted app-level secret. Deploy with \`doctl apps create --spec ${shellQuote(path.join(directory, "app.yaml"))}\`.`;
  p3.note(
    `Image     ${image}
Secrets   ${path.join(directory, ".env")} (mode 0600)${provider === "digitalocean" ? `
App spec  ${path.join(directory, "app.yaml")} (mode 0600)` : ""}
Storage   S3 required

${next}`,
    "Cloud deployment prepared"
  );
  p3.outro("Your configuration is ready. Never commit generated secret files.");
}
async function menu() {
  const installation = await findInstallation();
  if (!interactive) {
    if (installation) return doctor(installation.directory);
    usage();
    return;
  }
  showBrand(void 0, cliVersion);
  if (!installation) {
    const choice2 = unwrapPrompt(
      await p3.select({
        message: "What would you like to do?",
        options: [
          {
            value: "install",
            label: "Install Harly on this server",
            hint: "Docker + automatic HTTPS"
          },
          {
            value: "cloud",
            label: "Deploy to a managed cloud",
            hint: "Railway \xB7 Fly.io \xB7 DigitalOcean"
          },
          { value: "help", label: "Show advanced commands" }
        ]
      })
    );
    if (choice2 === "install") return init();
    if (choice2 === "cloud") return cloudSubmenu();
    usage();
    return;
  }
  p3.note(
    `${installation.config.publicUrl}
${installation.config.image}
${installation.directory}`,
    "Detected installation"
  );
  const choice = unwrapPrompt(
    await p3.select({
      message: "Choose an action",
      options: [
        { value: "status", label: "Status" },
        { value: "update", label: "Update Harly" },
        { value: "backup", label: "Create backup" },
        { value: "restore", label: "Restore backup" },
        { value: "uninstall", label: "Stop or uninstall Harly" }
      ]
    })
  );
  if (choice === "status") return doctor(installation.directory);
  if (choice === "update") return upgrade(installation.directory);
  if (choice === "backup")
    return backup(installation.directory).then(() => void 0);
  if (choice === "restore") {
    p3.log.info(
      "Use `harly restore <archive> --force` for restore. Local rollback archives work without extra dependencies; encrypted `.age` archives are an advanced option."
    );
    return;
  }
  return uninstall(installation.directory);
}
async function cloudSubmenu() {
  p3.note(
    [
      "Harly also runs on managed platforms, but the experience is the same:",
      "Docker, a managed PostgreSQL database, S3 for uploads, and a setup secret.",
      "Render and DigitalOcean have one-click deploy buttons from the README;",
      "the CLI writes the spec and secrets for the platforms below.",
      "",
      "See docs/cloud-deployments.md for the full guide."
    ].join("\n"),
    "Managed cloud"
  );
  const choice = unwrapPrompt(
    await p3.select({
      message: "Pick a platform",
      options: [
        { value: "railway", label: "Railway" },
        { value: "fly", label: "Fly.io" },
        { value: "digitalocean", label: "DigitalOcean App Platform" },
        { value: "back", label: "Back" }
      ]
    })
  );
  if (p3.isCancel(choice) || choice === "back") return;
  if (choice === "railway") return railwayGuide();
  return cloudGuide(choice);
}
async function deploy(provider) {
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
        2
      );
  }
}
async function main() {
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
      usage();
      return;
    case "--version":
    case "-v":
      process3.stdout.write(`${cliVersion}
`);
      return;
    default:
      usage();
      throw new CliError(`Unknown command: ${command}`, 2);
  }
}
main().catch(async (error) => {
  const result = await handleHarlyError(error, { interactive, yes });
  if (result.kind === "abort") process3.exit(result.exitCode);
});
