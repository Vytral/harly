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
import { readFileSync } from "node:fs";
import { createServer, isIP } from "node:net";
import { createSocket } from "node:dgram";
import os from "node:os";
import path from "node:path";
import process4 from "node:process";
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
  constructor(message, exitCode = 1, code) {
    super(message);
    this.exitCode = exitCode;
    this.code = code;
  }
  exitCode;
  code;
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
  for (const [program, args] of commands) {
    const result = run(program, args, { allowFailure: true });
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
var brandShown = false;
function showBrand(context, version = "") {
  const suffix = version ? ` ${soft(`\xB7 v${version}`)}` : "";
  if (brandShown) {
    if (context) process2.stdout.write(`
  ${ink(context)}${suffix}

`);
    return;
  }
  brandShown = true;
  process2.stdout.write(
    `
  ${accent(ink("harly"))}  ${soft("Self-hosted ATS")}${suffix}

`
  );
}
var spinnerStyle = { styleFrame: accent };
var wide = process2.env.HARLY_ASCII !== "1";
var mark = {
  ok: () => wide ? accent("\u2713") : accent("OK"),
  warn: () => wide ? pc.yellow("\u26A0") : pc.yellow("!!"),
  fail: () => wide ? pc.red("\u2717") : pc.red("XX")
};
var icon = {
  config: () => wide ? "\u2261" : "-",
  database: () => wide ? "\u25A4" : "-",
  app: () => wide ? "\u25A3" : "-",
  scheduler: () => wide ? "\u21BB" : "-",
  proxy: () => wide ? "\u21C4" : "-",
  network: () => wide ? "\u25CD" : "-",
  archive: () => wide ? "\u25BD" : "-",
  image: () => wide ? "\u25A6" : "-"
};
function rows(items) {
  const visible = (value) => (
    // eslint-disable-next-line no-control-regex
    value.replace(/\[[0-9;]*m/g, "").length
  );
  const width = Math.max(0, ...items.map((item) => visible(item.label)));
  return items.map((item) => {
    const status = item.status ? `${mark[item.status]()} ` : "";
    const glyph = item.icon ? `${soft(item.icon)} ` : "";
    const pad = " ".repeat(width - visible(item.label));
    const detail = item.detail ? `  ${pad}${soft(item.detail)}` : "";
    return `${status}${glyph}${item.label}${detail}`;
  });
}
function humanBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// src/pull.ts
var terminal = {
  "pull complete": "done",
  "already exists": "done",
  "download complete": "downloaded"
};
function humanDuration(ms) {
  const seconds = Math.round(ms / 1e3);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}
function bar(done, total, width = 24) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const filled = Math.round(ratio * width);
  return `${accent("\u2588".repeat(filled))}${soft("\u2591".repeat(width - filled))}`;
}
async function pullWithProgress(cwd, services, interactive2, label = "Pulling container images", doneLabel = "Container images downloaded") {
  if (!interactive2) {
    await runPlain(cwd, services);
    return;
  }
  const layers = /* @__PURE__ */ new Map();
  const bytes = /* @__PURE__ */ new Map();
  const startedAt = performance.now();
  const spin = p2.spinner(spinnerStyle);
  spin.start(label);
  const render = () => {
    const known = [...layers.values()];
    const complete = known.filter((state) => state === "done").length;
    const received = [...bytes.values()].reduce((sum, value) => sum + value, 0);
    const elapsed = (performance.now() - startedAt) / 1e3;
    const rate = received > 0 && elapsed > 1 ? `  ${soft(`\xB7 ${humanBytes(received / elapsed)}/s`)}` : "";
    const active = [...layers.entries()].filter(([, state]) => state === "downloading").slice(0, 3).map(
      ([id]) => `${accent("\u2193")} ${soft(id.slice(0, 12).padEnd(12))} ${humanBytes(bytes.get(id) ?? 0)}`
    );
    const headline = known.length ? `${bar(complete, known.length)}  ${complete}/${known.length} layers${received > 0 ? soft(` \xB7 ${humanBytes(received)}`) : ""}` : "contacting registry";
    spin.message([`${label}${rate}`, headline, ...active].join("\n   "));
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
    layers.size === 0 ? `${doneLabel} \u2014 already up to date` : `${doneLabel}  ${soft(`\xB7 ${summary}`)}`
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

// src/version.ts
var semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
function shortDigest(reference) {
  const digest = reference.split("@sha256:")[1];
  return digest ? `sha256:${digest.slice(0, 8)}` : reference;
}
function labelForTag(tag) {
  return semverPattern.test(tag) ? `v${tag}` : tag;
}
function inspectLabels(reference) {
  const result = run(
    "docker",
    [
      "image",
      "inspect",
      reference,
      "--format",
      '{{index .Config.Labels "org.opencontainers.image.version"}}	{{index .Config.Labels "org.opencontainers.image.revision"}}'
    ],
    { allowFailure: true }
  );
  if (result.status !== 0) return null;
  const [version, revision] = String(result.stdout ?? "").trim().split("	");
  const clean = (value) => value && value !== "<no value>" ? value : void 0;
  return { version: clean(version), revision: clean(revision) };
}
function describeImage(reference, release = embeddedRelease, inspect = inspectLabels) {
  const lastSegment = reference.split("/").at(-1) ?? reference;
  const tag = reference.includes("@sha256:") ? void 0 : lastSegment.includes(":") ? lastSegment.split(":").at(-1) : void 0;
  if (tag && semverPattern.test(tag))
    return { label: labelForTag(tag), source: "tag", reference };
  const labels = inspect(reference);
  const revision = labels?.revision?.slice(0, 7);
  if (tag) return { label: tag, source: "tag", revision, reference };
  if (reference.endsWith(`@${release.digest}`))
    return {
      label: labelForTag(release.version),
      source: "manifest",
      revision,
      reference
    };
  if (labels?.version)
    return {
      label: labelForTag(labels.version),
      source: "label",
      revision,
      reference
    };
  return { label: shortDigest(reference), source: "digest", revision, reference };
}
function versionLine(identity) {
  const ambiguous = identity.source !== "manifest" && !identity.label.startsWith("v");
  return ambiguous && identity.revision ? `${identity.label} \xB7 ${identity.revision}` : identity.label;
}
function envVersion(identity) {
  if (identity.source === "digest") {
    const digest = identity.reference.split("@sha256:")[1];
    return digest ? digest.slice(0, 12) : identity.label;
  }
  const base = identity.label.replace(/^v(?=\d)/, "");
  return !/^\d/.test(base) && identity.revision ? `${base}-${identity.revision}` : base;
}

// src/cli.ts
var booleanFlags = /* @__PURE__ */ new Set([
  "--dry-run",
  "--encrypt",
  "--fix",
  "--force",
  "--json",
  "--launch",
  "--no-launch",
  "--non-interactive",
  "--quiet",
  "--remove-data",
  "--save-env",
  "--verbose",
  "--yes",
  "--allow-plaintext",
  "--no-color",
  "--railway-token-stdin",
  "--s3-secret-stdin",
  "--fly-token-stdin",
  "--digitalocean-token-stdin"
]);
var valueFlags = /* @__PURE__ */ new Set([
  "--app",
  "--database-url",
  "--domain",
  "--email",
  "--image",
  "--organization",
  "--output-dir",
  "--port",
  "--project-name",
  "--proxy",
  "--region",
  "--resource-profile",
  "--s3-bucket",
  "--s3-endpoint",
  "--s3-public-url",
  "--s3-region",
  "--storage",
  "--timeout",
  "--to",
  "--url"
]);
var secretFlags = /* @__PURE__ */ new Set([
  "--access-key",
  "--access-key-id",
  "--database-url",
  "--password",
  "--railway-token",
  "--s3-access-key-id",
  "--s3-secret-access-key",
  "--secret",
  "--secret-key",
  "--token"
]);
function invalid(message) {
  const error = new Error(message);
  error.name = "CliUsageError";
  throw error;
}
function parseCliArgs(argv) {
  let commandIndex = -1;
  let command2 = "menu";
  const positionals2 = [];
  const flags2 = /* @__PURE__ */ new Set();
  const values = /* @__PURE__ */ new Map();
  const raw = [...argv];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("-")) {
      if (commandIndex < 0) {
        commandIndex = index;
        command2 = token;
      } else {
        positionals2.push(token);
      }
      continue;
    }
    if (token === "--") {
      positionals2.push(...argv.slice(index + 1));
      break;
    }
    const equalsIndex = token.indexOf("=");
    const name = equalsIndex >= 0 ? token.slice(0, equalsIndex) : token;
    const inlineValue = equalsIndex >= 0 ? token.slice(equalsIndex + 1) : void 0;
    const normalized = name === "-h" ? "--help" : name === "-v" ? "--version" : name;
    if (secretFlags.has(normalized)) {
      invalid(`${normalized} is not accepted. Use an environment variable or an explicit stdin flag.`);
    }
    if (!booleanFlags.has(normalized) && !valueFlags.has(normalized)) {
      if (normalized === "--help" || normalized === "--version") {
        flags2.add(normalized);
        continue;
      }
      invalid(`Unknown option: ${normalized}`);
    }
    if (booleanFlags.has(normalized)) {
      if (inlineValue !== void 0) invalid(`${normalized} does not accept a value.`);
      flags2.add(normalized);
      continue;
    }
    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith("--")) invalid(`${normalized} requires a value.`);
    if (inlineValue === void 0) index += 1;
    values.set(normalized, value);
  }
  if (flags2.has("--launch") && flags2.has("--no-launch")) {
    invalid("--launch and --no-launch cannot be used together.");
  }
  const stdinSecretFlags = [
    "--railway-token-stdin",
    "--s3-secret-stdin",
    "--fly-token-stdin",
    "--digitalocean-token-stdin"
  ].filter((flag) => flags2.has(flag));
  if (stdinSecretFlags.length > 1) {
    invalid("Only one explicit stdin secret may be requested per execution.");
  }
  return { command: command2, positionals: positionals2, flags: flags2, values, raw };
}
function option(parsed2, name) {
  return parsed2.values.get(name);
}
function hasOption(parsed2, name) {
  return parsed2.flags.has(name);
}

// src/result.ts
import process3 from "node:process";
var jsonSchemaVersion = 1;
function resultOk(command2, status, fields = {}) {
  return { schemaVersion: jsonSchemaVersion, ok: true, status, command: command2, ...fields };
}
function resultError(command2, status, code, message, fields = {}) {
  return {
    schemaVersion: jsonSchemaVersion,
    ok: false,
    status,
    command: command2,
    error: { code, message },
    ...fields
  };
}
function emitJson(value) {
  process3.stdout.write(`${JSON.stringify(value)}
`);
}
function errorCodeFor(error) {
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    if (typeof code === "string") return code;
  }
  return "INTERNAL_ERROR";
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
var parsed;
var parseError;
try {
  parsed = parseCliArgs(process4.argv.slice(2));
} catch (error) {
  parseError = error;
  parsed = {
    command: "help",
    positionals: [],
    flags: process4.argv.includes("--json") ? /* @__PURE__ */ new Set(["--json"]) : /* @__PURE__ */ new Set(),
    values: /* @__PURE__ */ new Map(),
    raw: process4.argv.slice(2)
  };
}
var command = parsed.flags.has("--version") ? "--version" : parsed.flags.has("--help") ? "--help" : parsed.command;
var flags = parsed.flags;
var positionals = parsed.positionals;
var toVersion = option(parsed, "--to");
var force = flags.has("--force");
var yes = flags.has("--yes");
var json = flags.has("--json");
var verbose = flags.has("--verbose");
var interactive = Boolean(
  !json && !flags.has("--non-interactive") && process4.stdin.isTTY && process4.stdout.isTTY && !process4.env.CI
);
var cliVersion = "0.4.0";
var jsonResultWritten = false;
function humanOut(message) {
  if (json) process4.stderr.write(message);
  else process4.stdout.write(message);
}
function writeResult(result) {
  if (!json || jsonResultWritten) return;
  jsonResultWritten = true;
  emitJson(result);
}
function stableErrorCode(error) {
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
function usageError(message, code = "INVALID_ARGUMENT") {
  return new CliError(message, 2, code);
}
function readExplicitSecretStdin(flag, envName) {
  if (!hasOption(parsed, flag)) return process4.env[envName]?.trim() || void 0;
  if (process4.stdin.isTTY) throw usageError(`${flag} requires piped stdin.`, "INVALID_SECRET_SOURCE");
  const data = readFileSync(0, "utf8");
  if (!data.trim()) throw usageError(`${envName} received through stdin is empty.`, "MISSING_SECRET");
  return data.trim();
}
var releaseManifestUrl = process4.env.HARLY_RELEASE_MANIFEST_URL ?? "https://raw.githubusercontent.com/Vytral/harly/main/release-manifest.json";
var currentOfficialRelease;
var releaseManifestChecked = false;
var railwayResources = [];
function recordRailwayResource(type, id, name) {
  railwayResources.push({ type, id, name });
}
async function promptOrValue(message, flag, envName, initialValue) {
  if (!interactive) {
    const value = option(parsed, flag) ?? process4.env[envName] ?? initialValue;
    if (!value?.trim()) throw usageError(`${flag} or ${envName} is required in non-interactive mode.`, "MISSING_ARGUMENT");
    return value.trim();
  }
  return unwrapPrompt(await p3.text({ message, initialValue }));
}
async function promptOrSecret(message, flag, envName, stdinFlag) {
  if (!interactive) {
    const stdinValue = readExplicitSecretStdin(stdinFlag, envName);
    const value = stdinValue ?? process4.env[envName];
    if (!value?.trim()) throw usageError(`${envName} is required in non-interactive mode.`, "MISSING_SECRET");
    return value.trim();
  }
  if (process4.env[envName]?.trim()) return process4.env[envName].trim();
  return unwrapPrompt(await p3.password({ message, validate: (value) => value?.trim() ? void 0 : "Required." }));
}
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
  process4.stdout.write(
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
  throw new CliError("Operation cancelled.", 2, "CANCELLED");
}
async function portAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error) => {
      resolve(error.code === "EACCES" || error.code === "EPERM");
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
  for (const [program, args] of commands) {
    const result = run(program, args, { allowFailure: true });
    const output = String(result.stdout ?? "").trim();
    if (result.status === 0 && output) return output.split("\n")[0].trim();
  }
  return void 0;
}
async function checkRequiredPorts(mode, requestedPort, ctx = { interactive, yes }) {
  const port = requestedPort ?? Number(process4.env.HARLY_PORT ?? 3e3);
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
  if (!atLeast(parseVersion(process4.versions.node), [20, 12, 0]))
    throw new DockerMissing(
      "not-installed",
      `Node.js 20.12 or newer is required (running ${process4.versions.node}).`
    );
  const docker = await readDockerInfo().catch((error) => {
    if (error instanceof DockerMissing) throw error;
    throw new DockerMissing(
      "not-installed",
      error instanceof Error ? error.message : "Docker check failed."
    );
  });
  const diskGb = await freeDiskGb(directory);
  const requiredDiskGb = Number(process4.env.HARLY_REQUIRED_DISK_GB ?? 5);
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
async function preflight(mode, checkPorts = true, requestedPort, directory = process4.cwd(), ctx = { interactive, yes }) {
  const host = await preflightHost(directory);
  if (checkPorts) await checkRequiredPorts(mode ?? "caddy", requestedPort, ctx);
  return host;
}
function requiredEnvironment(name, value) {
  if (value?.trim()) return value.trim();
  throw new CliError(`${name} is required in non-interactive mode.`, 2, "MISSING_ARGUMENT");
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
function operationTimeoutMs() {
  const value = Number(option(parsed, "--timeout") ?? process4.env.HARLY_CLI_TIMEOUT ?? 120);
  if (!Number.isFinite(value) || value < 1 || value > 3600)
    throw usageError("--timeout must be between 1 and 3600 seconds.");
  return value * 1e3;
}
async function waitForPublicReadiness(origin) {
  const timeoutMs = operationTimeoutMs();
  const started = Date.now();
  let lastDetail = "unreachable";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${origin}/api/health/ready`, {
        signal: AbortSignal.timeout(Math.min(5e3, timeoutMs))
      });
      if (response.ok) return;
      lastDetail = `HTTP ${response.status}`;
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : "unreachable";
    }
    await new Promise((resolve) => setTimeout(resolve, 2e3));
  }
  throw new CliError(`Public readiness did not complete within ${Math.round(timeoutMs / 1e3)} seconds (${lastDetail}).`, 1, "READINESS_TIMEOUT");
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
    const parsed2 = new URL(candidate);
    if (parsed2.pathname !== "/" || parsed2.search || parsed2.hash)
      return "Use an origin without a path, query, or hash.";
  } catch {
    return "Enter a valid domain or public URL.";
  }
}
function hostSummary(host) {
  return `${host.cpuCount} CPU \xB7 ${host.memoryGb.toFixed(1)} GB RAM \xB7 ${host.diskGb.toFixed(1)} GB free`;
}
async function collectNonInteractiveAnswers(directory) {
  const mode = option(parsed, "--proxy") ?? process4.env.HARLY_PROXY_MODE ?? "caddy";
  if (!["caddy", "external", "local"].includes(mode))
    throw usageError("Invalid proxy mode.", "INVALID_CONFIGURATION");
  const explicitUrl = option(parsed, "--url");
  const explicitDomain = option(parsed, "--domain");
  if (explicitUrl && !explicitUrl.includes("://"))
    throw usageError("--url requires an origin with an HTTP(S) protocol.");
  const envUrl = process4.env.HARLY_URL;
  const urlCandidate = explicitUrl ?? explicitDomain ?? envUrl;
  if (!urlCandidate) throw usageError("--url, --domain or HARLY_URL is required.", "MISSING_ARGUMENT");
  const url = normalizeUrl(urlCandidate, mode);
  if (explicitUrl && explicitDomain) {
    const domainUrl = normalizeUrl(explicitDomain, mode);
    if (domainUrl.origin !== url.origin)
      throw usageError("--url and --domain resolve to different origins.");
  }
  const port = Number(
    option(parsed, "--port") ?? process4.env.HARLY_PORT ?? (mode === "local" && url.port ? url.port : 3e3)
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw usageError("Port must be an integer between 1 and 65535.");
  const email = requiredEnvironment(
    "HARLY_INITIAL_ADMIN_EMAIL",
    option(parsed, "--email") ?? process4.env.HARLY_INITIAL_ADMIN_EMAIL
  ).toLowerCase();
  if (validateEmail(email)) throw usageError("Invalid owner email.", "INVALID_CONFIGURATION");
  const organization = option(parsed, "--organization")?.trim() || process4.env.HARLY_ORGANIZATION?.trim() || "My organization";
  const storage = option(parsed, "--storage") ?? process4.env.STORAGE_PROVIDER ?? "local";
  if (!["local", "s3"].includes(storage))
    throw usageError("Invalid storage provider.", "INVALID_CONFIGURATION");
  const resourceProfile = option(parsed, "--resource-profile") ?? process4.env.HARLY_RESOURCE_PROFILE ?? detectResourceProfile();
  if (!Object.hasOwn(resourceProfiles, resourceProfile))
    throw usageError("Invalid resource profile.", "INVALID_CONFIGURATION");
  const s3Secret = readExplicitSecretStdin("--s3-secret-stdin", "S3_SECRET_ACCESS_KEY");
  const s3 = storage === "s3" ? {
    bucket: requiredEnvironment("S3_BUCKET", option(parsed, "--s3-bucket") ?? process4.env.S3_BUCKET),
    region: option(parsed, "--s3-region")?.trim() || process4.env.S3_REGION?.trim() || "auto",
    accessKeyId: requiredEnvironment(
      "S3_ACCESS_KEY_ID",
      process4.env.S3_ACCESS_KEY_ID
    ),
    secretAccessKey: requiredEnvironment(
      "S3_SECRET_ACCESS_KEY",
      s3Secret ?? process4.env.S3_SECRET_ACCESS_KEY
    ),
    endpoint: option(parsed, "--s3-endpoint")?.trim() || process4.env.S3_ENDPOINT?.trim() || "",
    publicUrl: option(parsed, "--s3-public-url")?.trim() || process4.env.S3_PUBLIC_URL?.trim() || ""
  } : null;
  const image = option(parsed, "--image") ?? process4.env.HARLY_IMAGE_REF ?? releaseImage(flags.has("--dry-run") ? embeddedRelease : await officialRelease());
  if (image.endsWith(":latest"))
    throw new CliError(
      "Installations must pin a version or digest, never latest.",
      2
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
    image
  };
}
async function collectInteractiveAnswers(directory) {
  const requestedUrl = option(parsed, "--url");
  const requestedDomain = option(parsed, "--domain");
  if (requestedUrl && !requestedUrl.includes("://"))
    throw usageError("--url requires an origin with an HTTP(S) protocol.");
  const initialUrl = requestedUrl ?? requestedDomain ?? process4.env.HARLY_URL ?? "careers.example.com";
  showBrand("Install", cliVersion);
  p3.note(
    [
      "Point a public domain to this server.",
      "For automatic HTTPS, allow TCP 80/443 and UDP 443.",
      soft("Guide: github.com/Vytral/harly/blob/main/docs/self-hosting.md#vps-requirements")
    ].join("\n"),
    "Before you begin"
  );
  const publicOrigin = unwrapPrompt(
    await p3.text({
      message: "Public domain or subdomain",
      placeholder: "careers.example.com",
      initialValue: initialUrl,
      validate: validatePublicOrigin
    })
  );
  let mode = unwrapPrompt(
    await p3.select({
      message: "Reverse proxy",
      initialValue: option(parsed, "--proxy") ?? process4.env.HARLY_PROXY_MODE ?? "caddy",
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
  if (requestedUrl && requestedDomain) {
    const domainUrl = normalizeUrl(requestedDomain, mode);
    if (domainUrl.origin !== url.origin)
      throw usageError("--url and --domain resolve to different origins.");
  }
  const preflightSpinner = p3.spinner(spinnerStyle);
  preflightSpinner.start("Checking Docker, ports, and DNS");
  let dnsAnswers = [];
  let requestedPort = Number(
    option(parsed, "--port") ?? process4.env.HARLY_PORT ?? (mode === "local" && url.port ? url.port : 3e3)
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
      dnsAnswers.length > 0 ? `Server ready  ${soft(`\xB7 DNS resolved \xB7 ${dnsAnswers.length} address${dnsAnswers.length === 1 ? "" : "es"}`)}` : "Server ready"
    );
  } catch (error) {
    preflightSpinner.stop("Host preflight failed");
    throw error;
  }
  const email = unwrapPrompt(
    await p3.text({
      message: "Initial owner email",
      placeholder: "owner@example.com",
      initialValue: option(parsed, "--email") ?? process4.env.HARLY_INITIAL_ADMIN_EMAIL,
      validate: validateEmail
    })
  ).toLowerCase();
  const organization = unwrapPrompt(
    await p3.text({
      message: "Organization name",
      placeholder: "Acme Inc.",
      initialValue: option(parsed, "--organization") ?? process4.env.HARLY_ORGANIZATION ?? "My organization",
      validate: (value) => value?.trim() ? void 0 : "Enter an organization name."
    })
  );
  const storage = unwrapPrompt(
    await p3.select({
      message: "File storage",
      initialValue: option(parsed, "--storage") ?? process4.env.STORAGE_PROVIDER ?? "local",
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
        initialValue: option(parsed, "--s3-bucket") ?? process4.env.S3_BUCKET,
        validate: (value) => value?.trim() ? void 0 : "Enter the bucket name."
      })
    ),
    region: unwrapPrompt(
      await p3.text({
        message: "S3 region",
        initialValue: option(parsed, "--s3-region") ?? process4.env.S3_REGION ?? "auto"
      })
    ),
    accessKeyId: unwrapPrompt(
      await p3.text({
        message: "S3 access key ID",
        initialValue: process4.env.S3_ACCESS_KEY_ID,
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
        initialValue: option(parsed, "--s3-endpoint") ?? process4.env.S3_ENDPOINT ?? ""
      })
    ),
    publicUrl: unwrapPrompt(
      await p3.text({
        message: "S3 public URL",
        placeholder: "Optional",
        initialValue: option(parsed, "--s3-public-url") ?? process4.env.S3_PUBLIC_URL ?? ""
      })
    )
  } : null;
  const detectedProfile = detectResourceProfile();
  p3.log.success(
    `Server detected  ${soft(`\xB7 ${hostSummary(host)} \xB7 ${detectedProfile}`)}`
  );
  const resourceProfile = unwrapPrompt(
    await p3.select({
      message: "Resource profile",
      initialValue: option(parsed, "--resource-profile") ?? process4.env.HARLY_RESOURCE_PROFILE ?? detectedProfile,
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
  const image = option(parsed, "--image") ?? process4.env.HARLY_IMAGE_REF ?? releaseImage(await officialRelease());
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
      `Services    ${services}`,
      `Ports       ${mode === "caddy" ? "80, 443" : `127.0.0.1:${localPort}`}`,
      `Storage     ${storage === "local" ? "Local" : "S3-compatible"}`,
      `Profile     ${resourceProfile}`,
      `HTTPS       ${mode === "caddy" ? "Managed automatically by Caddy" : mode === "external" ? "Managed by external proxy" : "Disabled"}`
    ].join("\n"),
    "Installation summary"
  );
  const approved = unwrapPrompt(
    await p3.confirm({
      message: "Continue with this configuration?",
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
  const temp = `${file}.tmp-${process4.pid}-${randomBytes(4).toString("hex")}`;
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
    if (!dryRun) await mkdir(directory, { recursive: true });
    const envPath = path.join(directory, ".env");
    if (!await exists(envPath)) {
      setupSecret2 = secret();
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
    if (json) {
      writeResult(resultOk("init", "dry-run", {
        resolvedConfig: { directory, url: url.origin, proxy: mode, storage, resourceProfile },
        artifacts: wouldCreate.map((name) => name.split(" ")[0]),
        operations: {
          local: ["preflight", "generate configuration", ...flags.has("--launch") ? ["pull image", "start services", "verify readiness"] : []],
          remote: mode === "local" ? [] : ["verify public DNS"]
        },
        sideEffects: false
      }));
    } else {
      humanOut(`${lines.join("\n")}
`);
    }
    if (interactive) p3.outro("Re-run without --dry-run to write these files.");
    return;
  }
  generationSpinner?.stop("Configuration ready");
  if (interactive) {
    const launchNow = flags.has("--launch") ? true : flags.has("--no-launch") ? false : unwrapPrompt(await p3.confirm({ message: "Install and launch Harly now?", initialValue: true }));
    if (launchNow) {
      await launch(directory, true, false);
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
        humanOut(
          `
Setup secret (copy and keep it safe \u2014 you will need it at ${url.origin}/setup):
  ${accent(setupSecret2)}

`
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
      ...flags.has("--launch") ? {} : { next: [`cd ${shellQuote(directory)} && npx @harly/cli launch --yes`] }
    });
    if (json) {
      writeResult(result);
      return;
    }
    humanOut(
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
      humanOut(
        `
Setup secret: ${setupSecret2}
Use it at ${url.origin}/setup to claim the owner account.

`
      );
    } else {
      humanOut("\n");
    }
  }
}
function printInstallOutro(args) {
  const { url, email, mode, setupSecret: setupSecret2, envWritten, directory } = args;
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
  lines.push(
    ...rows([
      { label: accent("harly doctor"), detail: "verify the public route" },
      { label: accent("harly backup"), detail: "write a private rollback point" },
      { label: accent("harly update"), detail: "apply future upgrades safely" }
    ]).map((row) => `  ${row}`)
  );
  if (mode === "caddy") {
    lines.push("");
    lines.push(
      soft(
        "If HTTPS does not load, check that TCP 80/443 and UDP 443 are open in the cloud security group."
      )
    );
  }
  p3.log.message(lines.join("\n").replace(/^\n/, ""));
  p3.outro(`Harly is ready at ${accent(url)}`);
}
function renderHostCheck(host, options = {}) {
  const rows2 = [];
  rows2.push({
    label: "Host",
    status: "ok",
    detail: `${host.distro}, ${host.cpuCount} CPU, ${host.freeMemoryGb.toFixed(1)} GB free of ${host.memoryGb.toFixed(1)} GB`
  });
  if (host.docker) {
    rows2.push({
      label: "Docker",
      status: "ok",
      detail: `Engine ${host.docker.engine} (need \u2265 24)`
    });
    rows2.push({
      label: "Compose",
      status: "ok",
      detail: `${host.docker.compose} (need \u2265 2.20)`
    });
  } else {
    rows2.push({
      label: "Docker",
      status: "fail",
      detail: "missing",
      fix: "Install Docker Engine 24+"
    });
  }
  const requiredDiskGb = Number(process4.env.HARLY_REQUIRED_DISK_GB ?? 5);
  rows2.push({
    label: "Disk",
    status: host.diskGb >= requiredDiskGb ? "ok" : "fail",
    detail: `${host.diskGb.toFixed(1)} GB free`,
    ...host.diskGb < requiredDiskGb ? { fix: `Free at least ${requiredDiskGb} GB on the install path` } : {}
  });
  if (host.firewall) {
    rows2.push({
      label: "Firewall",
      status: "warn",
      detail: host.firewall.detail,
      fix: `Run: ${host.firewall.fix}`
    });
  }
  for (const port of options.ports ?? []) {
    rows2.push({ label: `Port ${port.port}`, status: "warn", detail: port.detail });
  }
  const labelWidth = Math.max(...rows2.map((row) => row.label.length));
  const glyph = (status) => status === "ok" ? accent("\u2713") : status === "warn" ? pc2.yellow("\u26A0") : pc2.red("\u2717");
  const lines = ["", `  ${ink("Harly self-host requirements")}`, ""];
  for (const row of rows2) {
    lines.push(
      `  ${glyph(row.status)} ${row.label.padEnd(labelWidth)}  ${row.detail}`
    );
    if (row.fix) lines.push(`  ${" ".repeat(labelWidth + 4)}${soft(row.fix)}`);
  }
  return lines.join("\n");
}
async function harlyCheck(directory = process4.cwd()) {
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
  const requiredDiskGb = Number(process4.env.HARLY_REQUIRED_DISK_GB ?? 5);
  const allOk = !host.firewall && portChecks.length === 0 && host.diskGb >= requiredDiskGb;
  if (json) {
    writeResult(resultOk("check", allOk ? "ready" : "failed", {
      report: output,
      host,
      ports: portChecks
    }));
    if (!allOk) process4.exitCode = 1;
    return;
  }
  process4.stdout.write(`${output}

`);
  if (interactive) {
    if (allOk) {
      p3.log.success("Your host is ready. Run `harly init` to install Harly.");
    } else {
      p3.log.warn("Some checks need attention. Resolve them above, then run `harly init`.");
    }
  } else {
    if (!allOk) process4.exitCode = 1;
  }
}
async function setupSecret(explicitDirectory) {
  const directory = path.resolve(
    explicitDirectory ?? positionals[0] ?? process4.cwd()
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
  if (json) {
    writeResult(resultOk("setup-secret", "available", {
      directory: path.dirname(envPath),
      secretAvailable: true
    }));
  } else {
    process4.stdout.write(`${secret2}
`);
  }
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
async function findInstallation(start = process4.cwd()) {
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
          const parsed2 = JSON.parse(stdout);
          const item = Array.isArray(parsed2) ? parsed2[0] : parsed2;
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
async function launch(explicitDirectory, confirmed = false, emit = true) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  if (interactive && !confirmed) {
    showBrand("Launch");
    const identity = describeImage(
      config.requestedImage ?? config.image,
      await officialRelease()
    );
    p3.log.message(
      rows([
        { icon: icon.image(), label: "Version", detail: versionLine(identity) },
        { icon: icon.proxy(), label: "Mode", detail: config.proxyMode },
        { icon: icon.network(), label: "URL", detail: config.publicUrl }
      ]).join("\n")
    );
  } else if (!interactive) {
    humanOut(
      `Image: ${config.image}
Mode: ${config.proxyMode}
Commands: docker compose pull; docker compose up -d --wait
`
    );
  }
  if (!confirmed && !yes && !await confirm2("Continue?")) {
    if (!process4.stdin.isTTY)
      throw new CliError("--yes is required in non-interactive mode.", 2);
    throw new CliError("Launch cancelled.", 2);
  }
  progressStep(
    "Validating configuration",
    "Configuration validated",
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
      humanOut(`  \u2026 ${service}
`);
    }
    const result = await waitForService(directory, service, 9e4);
    const elapsedSec = (Date.now() - start) / 1e3;
    if (interactive) {
      const line = formatLaunchLine(service, result.ready, result.detail, elapsedSec);
      step?.stop(line);
    } else {
      humanOut(
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
    p3.log.message(
      rows([
        {
          icon: icon.network(),
          label: "Public URL",
          detail: config.publicUrl,
          status: publicOk ? "ok" : "warn"
        }
      ]).join("\n")
    );
  } else {
    humanOut(
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
    p3.log.message(
      `${accent(config.publicUrl)}
${soft(`Run ${accent("harly doctor")} to verify the installation.`)}`
    );
    p3.outro("Harly is ready");
  } else if (!interactive) {
    if (json && emit) {
      writeResult(resultOk("launch", "ready", {
        directory,
        url: config.publicUrl,
        image: config.image,
        services: results.reduce((acc, item) => {
          acc[item.service] = item.ready ? "ready" : "failed";
          return acc;
        }, {})
      }));
    }
    humanOut(
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
  if (print) {
    if (json) {
      writeResult(resultOk("doctor", result.ok ? "ready" : "failed", result));
    } else if (interactive) {
      const glyphs = {
        compose: icon.config(),
        "service:postgres": icon.database(),
        "service:app": icon.app(),
        "service:scheduler": icon.scheduler(),
        "service:caddy": icon.proxy(),
        "profile:caddy": icon.proxy(),
        readiness: icon.network()
      };
      const body = rows(
        checks.map((check) => ({
          icon: glyphs[check.name],
          label: check.label,
          detail: check.detail,
          status: check.ok ? "ok" : "fail"
        }))
      );
      p3.log.message(body.join("\n"));
      if (result.ok) p3.log.success("Harly is healthy.");
      else p3.log.error("Harly needs attention.");
    } else {
      process4.stdout.write(
        `
${checks.map(
          (check) => `  ${check.ok ? accent("\u2713") : pc2.red("\u2717")} ${check.label}${check.detail ? ` ${soft(`\xB7 ${check.detail}`)}` : ""}  ${soft(check.name)}`
        ).join("\n")}

  ${result.ok ? accent("Harly is healthy.") : pc2.red("Harly needs attention.")}

`
      );
    }
  }
  if (!result.ok && print) process4.exitCode = 1;
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
async function backup(explicitDirectory, print = true) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  const config = await readConfig(directory);
  const database = await deploymentDatabase(directory);
  const recipient = process4.env.AGE_RECIPIENT ?? (await deploymentEnvironment(directory)).get("AGE_RECIPIENT");
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
      if (print) process4.stdout.write(`${archive}
`);
      return archive;
    }
    const encrypted = `${archive}.age`;
    run("age", ["-r", recipient, "-o", encrypted, archive]);
    await chmod(encrypted, 384);
    await rm(archive, { force: true });
    if (print) process4.stdout.write(`${encrypted}
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
    const identity = process4.env.AGE_IDENTITY;
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
    process4.stderr.write(
      "This backup does not include S3 objects. Verify the bucket backup/version history before restoring.\n"
    );
  }
  process4.stdout.write("Creating a safety backup of the current deployment\u2026\n");
  await backup(directory);
  process4.stdout.write("Safety backup saved. Preparing restore\u2026\n");
  compose(directory, ["stop", "app", "scheduler", "migrate"], {
    allowFailure: true
  });
  try {
    process4.stdout.write("Restoring database\u2026\n");
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
      process4.stdout.write("Restoring local uploads\u2026\n");
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
    process4.stdout.write("Applying migrations\u2026\n");
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
  process4.stdout.write("Restore complete. Harly is healthy.\n");
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
  const release = await officialRelease();
  const currentIdentity = describeImage(config.image, release);
  const targetIdentity = describeImage(requestedImage, release, () => null);
  if (!yes && !await confirm2(
    `Update Harly from ${versionLine(currentIdentity)} to ${versionLine(targetIdentity)}?`
  )) {
    if (!interactive)
      throw new CliError("--yes is required in non-interactive mode.", 2);
    throw new CliError("Upgrade cancelled.", 2);
  }
  if (interactive) {
    showBrand("Update");
    p3.log.message(
      rows([
        {
          icon: icon.image(),
          label: "Current",
          detail: versionLine(currentIdentity)
        },
        {
          icon: icon.image(),
          label: "Target",
          detail: versionLine(targetIdentity)
        },
        { icon: icon.archive(), label: "Data", detail: "preserved" }
      ]).join("\n")
    );
  }
  const totalPhases = 4;
  const phase = (index, message) => `${soft(`${index}/${totalPhases}`)}  ${message}`;
  let archive = "";
  if (interactive) {
    const step = p3.spinner(spinnerStyle);
    step.start(phase(1, "Writing a rollback point"));
    try {
      archive = await backup(directory, false);
    } catch (error) {
      step.stop(phase(1, "Rollback point failed"));
      throw error;
    }
    const size = await stat(archive).then(
      (info) => humanBytes(info.size),
      () => ""
    );
    step.stop(
      `${phase(1, "Rollback point written")}  ${soft(
        [size, path.relative(directory, archive)].filter(Boolean).join(" \xB7 ")
      )}`
    );
  } else {
    archive = await backup(directory, false);
    process4.stdout.write(`${archive}
`);
  }
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
      interactive,
      phase(2, "Downloading container images"),
      phase(2, "Container images downloaded")
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
  const deployedIdentity = describeImage(
    digest ? requestedImage : deployedImage,
    release
  );
  const deployedVersion = envVersion(deployedIdentity);
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
      phase(3, "Applying database migrations"),
      phase(3, "Migrations applied"),
      () => compose(directory, ["run", "--rm", "migrate"])
    );
    progressStep(
      phase(4, "Recreating services and waiting for healthchecks"),
      phase(4, "Services are healthy"),
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
  if (interactive) {
    p3.log.message(
      soft(`Rollback point: ${path.relative(directory, archive) || archive}`)
    );
    p3.outro(
      `Harly is running ${accent(versionLine(deployedIdentity))} at ${accent(config.publicUrl)}`
    );
  }
}
async function uninstall(explicitDirectory) {
  const directory = path.resolve(explicitDirectory ?? positionals[0] ?? ".");
  await readConfig(directory);
  const finish = (message) => {
    if (interactive) p3.outro(message);
    else process4.stdout.write(`${message}
`);
  };
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
      finish("Containers removed; data volumes kept.");
      return;
    }
    let archive = "";
    if (interactive) {
      const step = p3.spinner(spinnerStyle);
      step.start("Writing a final backup before deleting data volumes");
      try {
        archive = await backup(directory, false);
      } catch (error) {
        step.stop("Final backup failed");
        throw error;
      }
      const size = await stat(archive).then(
        (info) => humanBytes(info.size),
        () => ""
      );
      step.stop(
        `Final backup written  ${soft(
          [size, path.relative(directory, archive)].filter(Boolean).join(" \xB7 ")
        )}`
      );
    } else {
      process4.stdout.write(
        "Creating a final backup before deleting data volumes.\n"
      );
      archive = await backup(directory, false);
      process4.stdout.write(`${archive}
`);
    }
    compose(directory, ["down", "--volumes"]);
    if (interactive)
      p3.log.warn(
        `Data volumes were deleted. The only copy left is ${accent(archive)}`
      );
    finish(
      "Harly containers and data volumes were removed. Local backup archives were kept."
    );
  } else {
    compose(directory, ["down"]);
    finish(
      "Harly containers were removed. PostgreSQL, uploads, and backups were kept."
    );
  }
}
async function railwayGuide() {
  if (!json) showBrand("Railway", cliVersion);
  const token = await promptOrSecret(
    "Railway API token (from railway.app/account/tokens)",
    "--railway-token",
    "RAILWAY_TOKEN",
    "--railway-token-stdin"
  );
  const projectName = await promptOrValue("Railway project name", "--project-name", "HARLY_PROJECT_NAME", "harly");
  const email = (await promptOrValue("Initial owner email", "--email", "HARLY_INITIAL_ADMIN_EMAIL")).toLowerCase();
  if (validateEmail(email)) throw usageError("Invalid owner email.", "INVALID_CONFIGURATION");
  const bucket = await promptOrValue("S3-compatible bucket (required for cloud uploads)", "--s3-bucket", "S3_BUCKET");
  const region = await promptOrValue("S3 region", "--s3-region", "S3_REGION", "auto");
  const accessKey = await promptOrValue("S3 access key", "--s3-access-key-id", "S3_ACCESS_KEY_ID");
  const secretKey = await promptOrSecret("S3 secret key", "--s3-secret-access-key", "S3_SECRET_ACCESS_KEY", "--s3-secret-stdin");
  const requestedUrlValue = option(parsed, "--url") ?? option(parsed, "--domain");
  if (option(parsed, "--url") && !option(parsed, "--url").includes("://"))
    throw usageError("--url requires an origin with an HTTP(S) protocol.");
  const requestedUrl = requestedUrlValue ? normalizeUrl(requestedUrlValue, "external").origin : void 0;
  const deploymentRelease = flags.has("--dry-run") ? embeddedRelease : await officialRelease();
  const image = releaseImage(deploymentRelease);
  const runtimeSecrets = {
    betterAuth: secret(),
    aiEncryption: secret(),
    storageUpload: secret(),
    cron: secret(),
    setup: secret()
  };
  const postgresPassword = secret();
  if (flags.has("--dry-run")) {
    writeResult(resultOk("deploy", "dry-run", {
      provider: "railway",
      projectName,
      ...requestedUrl ? { requestedUrl } : {},
      operations: {
        local: ["validate configuration", "resolve pinned release"],
        remote: [
          "create Railway project",
          "provision managed PostgreSQL and volume",
          "create web, scheduler and migrate services",
          "set environment variables",
          "run migrations",
          "deploy web and scheduler",
          "verify public readiness"
        ]
      },
      artifacts: flags.has("--save-env") ? [path.join(path.resolve(option(parsed, "--output-dir") ?? "harly-railway"), ".env")] : [],
      sideEffects: false
    }));
    return;
  }
  const spin = p3.spinner(spinnerStyle);
  if (interactive) spin.start("Creating Railway project");
  else humanOut("[1/7] Creating Railway project...\n");
  const { projectId, environmentId } = await railwayCreateProject(
    token,
    projectName
  );
  recordRailwayResource("project", projectId, projectName);
  if (interactive) spin.message("Provisioning managed PostgreSQL");
  else humanOut("[2/7] Provisioning managed PostgreSQL...\n");
  const postgresServiceId = await railwayCreateService(
    token,
    projectId,
    "postgres",
    "ghcr.io/railwayapp-templates/postgres-ssl:latest"
  );
  recordRailwayResource("service", postgresServiceId, "postgres");
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
  if (interactive) spin.message("Creating web service");
  else humanOut("[3/7] Creating web service...\n");
  const webServiceId = await railwayCreateService(
    token,
    projectId,
    "web",
    image
  );
  recordRailwayResource("service", webServiceId, "web");
  await railwayUpdateInstance(token, environmentId, webServiceId, {
    healthcheckPath: "/api/health/ready",
    restartPolicyType: "ON_FAILURE"
  });
  const domain = await railwayCreateDomain(token, environmentId, webServiceId);
  const url = normalizeUrl(`https://${domain}`, "external");
  if (interactive) spin.message("Creating scheduler service");
  else humanOut("[4/7] Creating scheduler service...\n");
  const schedulerServiceId = await railwayCreateService(
    token,
    projectId,
    "scheduler",
    image
  );
  recordRailwayResource("service", schedulerServiceId, "scheduler");
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
  if (interactive) spin.message("Setting environment variables");
  else humanOut("[5/7] Setting environment variables...\n");
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
  if (interactive) spin.message("Running database migrations");
  else humanOut("[6/7] Running database migrations...\n");
  const migrateServiceId = await railwayCreateService(
    token,
    projectId,
    "migrate",
    image
  );
  recordRailwayResource("service", migrateServiceId, "migrate");
  await railwayUpdateInstance(token, environmentId, migrateServiceId, {
    startCommand: "node /app/runtime.mjs migrate",
    numReplicas: 0
  });
  await railwaySetVariables(token, projectId, environmentId, migrateServiceId, {
    DATABASE_URL: databaseUrl
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
  const env = Object.entries(sharedEnv).map(([key, value]) => `${key}=${envLine(value)}`).join("\n") + "\n";
  let savedEnvPath;
  if (flags.has("--save-env") && !flags.has("--dry-run")) {
    await mkdir(directory, { recursive: true });
    savedEnvPath = path.join(directory, ".env");
    if (await exists(savedEnvPath) && !force)
      throw usageError(`${savedEnvPath} already exists. Use --force only to replace it.`);
    await atomicWrite(savedEnvPath, env, 384);
    await chmod(savedEnvPath, 384);
    if (!json) process4.stderr.write(`Warning: Railway secrets were saved locally at ${savedEnvPath} with mode 0600.
`);
  }
  const result = resultOk("deploy", "ready", {
    provider: "railway",
    project: { id: projectId, name: projectName, environmentId },
    url: url.origin,
    ...requestedUrl && requestedUrl !== url.origin ? { requestedUrl } : {},
    version: versionLine(describeImage(image, deploymentRelease, () => null)),
    resources: railwayResources.map(({ type, id, name }) => ({ type, id, name })),
    ...savedEnvPath ? { artifacts: [savedEnvPath] } : {},
    next: [
      `Open ${url.origin}/setup to claim the owner account.`,
      "The one-shot migrate service can be deleted after it succeeds.",
      ...requestedUrl && requestedUrl !== url.origin ? [`Attach and verify the custom domain ${requestedUrl} in Railway.`] : []
    ]
  });
  if (json) {
    writeResult(result);
    return;
  }
  p3.note(
    `Project    ${projectName} (${projectId})
URL        ${url.origin}
Version    ${versionLine(describeImage(image, deploymentRelease, () => null))}
` + (savedEnvPath ? `Secrets    ${savedEnvPath} (mode 0600, explicitly saved)
` : "Secrets    not saved locally (use --save-env to opt in)\n") + "\nThe migrate service ran once and can be deleted from the Railway dashboard once its deployment succeeds. Watch build/deploy logs at railway.app." + (requestedUrl && requestedUrl !== url.origin ? ` Configure ${requestedUrl} as a custom domain before using it.` : ""),
    "Railway deployment ready"
  );
  p3.outro(`Harly is ready at ${accent(url.origin)}.`);
}
async function cloudGuide(provider) {
  const providerName = provider === "fly" ? "Fly.io" : "DigitalOcean";
  if (!json) showBrand(providerName, cliVersion);
  const suppliedUrl = option(parsed, "--url") ?? option(parsed, "--domain") ?? process4.env.HARLY_URL;
  if (!suppliedUrl) throw usageError("--url, --domain or HARLY_URL is required.", "MISSING_ARGUMENT");
  if (option(parsed, "--url") && !option(parsed, "--url").includes("://"))
    throw usageError("--url requires an origin with an HTTP(S) protocol.");
  const url = normalizeUrl(suppliedUrl, "external");
  const email = (await promptOrValue("Initial owner email", "--email", "HARLY_INITIAL_ADMIN_EMAIL")).toLowerCase();
  if (validateEmail(email)) throw usageError("Invalid owner email.", "INVALID_CONFIGURATION");
  const bucket = await promptOrValue("S3-compatible bucket (required for cloud uploads)", "--s3-bucket", "S3_BUCKET");
  const region = await promptOrValue("S3 region", "--s3-region", "S3_REGION", "auto");
  const accessKey = await promptOrValue("S3 access key", "--s3-access-key-id", "S3_ACCESS_KEY_ID");
  const secretKey = await promptOrSecret("S3 secret key", "--s3-secret-access-key", "S3_SECRET_ACCESS_KEY", "--s3-secret-stdin");
  const databaseUrl = provider === "digitalocean" ? await promptOrValue("DigitalOcean Managed PostgreSQL connection URL", "--database-url", "DATABASE_URL") : void 0;
  const directory = path.resolve(option(parsed, "--output-dir") ?? `harly-${provider}`);
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
  const saveEnv = flags.has("--save-env");
  if (saveEnv && !flags.has("--dry-run")) {
    await mkdir(directory, { recursive: true });
    const envPath = path.join(directory, ".env");
    if (await exists(envPath) && !force) throw usageError(`${envPath} already exists. Use --force to replace it.`);
    await atomicWrite(envPath, env, 384);
    await chmod(envPath, 384);
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
`
    );
  }
  if (provider === "digitalocean") {
    const yaml = (value) => JSON.stringify(value);
    const secretEnv = (key, value) => `  - { key: ${key}, scope: RUN_TIME, type: SECRET, value: ${yaml(saveEnv ? value : "<set-in-provider-dashboard>")} }`;
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
    if (!flags.has("--dry-run")) await atomicWrite(path.join(directory, "app.yaml"), appSpec, 384);
  }
  const next = provider === "fly" ? `Run \`fly launch --no-deploy\` in ${shellQuote(directory)}, attach Managed Postgres, import .env as Fly secrets, then run \`fly deploy\`.` : `The generated app spec already includes your Managed PostgreSQL URL as an encrypted app-level secret. Deploy with \`doctl apps create --spec ${shellQuote(path.join(directory, "app.yaml"))}\`.`;
  const artifacts = [path.join(directory, provider === "fly" ? "fly.toml" : "app.yaml"), ...saveEnv ? [path.join(directory, ".env")] : []];
  const result = resultOk("deploy", "ready-to-deploy", {
    provider,
    url: url.origin,
    version: versionLine(describeImage(image, deploymentRelease, () => null)),
    artifacts,
    pending: [next],
    ...saveEnv ? {} : { note: "Secrets were not saved locally. Use --save-env to opt in." }
  });
  if (json) {
    writeResult(result);
    return;
  }
  p3.note(
    `Version   ${versionLine(describeImage(image, deploymentRelease, () => null))}
${saveEnv ? `Secrets   ${path.join(directory, ".env")} (mode 0600, explicitly saved)` : "Secrets   not saved locally (use --save-env to opt in)"}${provider === "digitalocean" ? `
App spec  ${path.join(directory, "app.yaml")} (mode 0600)` : ""}
Storage   S3 required

${next}`,
    "Cloud deployment prepared"
  );
  p3.outro("Configuration ready to deploy. Never commit generated secret files.");
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
  const identity = describeImage(
    installation.config.requestedImage ?? installation.config.image,
    await officialRelease()
  );
  p3.log.message(
    rows([
      {
        icon: icon.network(),
        label: "URL",
        detail: installation.config.publicUrl
      },
      {
        icon: icon.image(),
        label: "Version",
        detail: versionLine(identity)
      },
      {
        icon: icon.config(),
        label: "Directory",
        detail: installation.directory
      }
    ]).join("\n")
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
      else process4.stdout.write(`${cliVersion}
`);
      return;
    default:
      usage();
      throw new CliError(`Unknown command: ${command}`, 2);
  }
}
process4.once("SIGINT", () => {
  if (json) writeResult(resultError(command, "cancelled", "CANCELLED", "Operation cancelled."));
  else process4.stderr.write("Operation cancelled.\n");
  process4.exit(130);
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
            "Delete unused resources manually if the deployment is abandoned."
          ]
        }
      } : {}));
    }
    process4.exit(exitCode);
  }
});
