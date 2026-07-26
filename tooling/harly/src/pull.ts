import { spawn } from "node:child_process";
import process from "node:process";

import * as p from "@clack/prompts";

import { accent, soft, spinnerStyle } from "./theme.js";

type LayerState = "waiting" | "downloading" | "downloaded" | "done";

const terminal: Record<string, LayerState> = {
  "pull complete": "done",
  "already exists": "done",
  "download complete": "downloaded",
};

function humanBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function humanDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`
    : `${seconds}s`;
}

function bar(done: number, total: number, width = 24): string {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const filled = Math.round(ratio * width);
  return `${accent("█".repeat(filled))}${soft("░".repeat(width - filled))}`;
}

/**
 * Streams `docker compose pull` instead of buffering it.
 *
 * A cold install downloads roughly a gigabyte. Buffering that through
 * spawnSync leaves the spinner frozen for minutes with no signal that anything
 * is happening, which reads as a hung installer. Compose emits one
 * ` <layer> <status> <bytes>` line per event under `--progress plain`, so
 * progress is tracked by completed layers: Docker reports bytes received but
 * never a layer's total size, which makes a byte-percentage impossible to
 * compute honestly.
 */
export async function pullWithProgress(
  cwd: string,
  services: string[],
  interactive: boolean,
): Promise<void> {
  if (!interactive) {
    await runPlain(cwd, services);
    return;
  }

  const layers = new Map<string, LayerState>();
  const bytes = new Map<string, number>();
  const startedAt = performance.now();
  const spin = p.spinner(spinnerStyle);
  spin.start("Pulling container images");

  const render = () => {
    const known = [...layers.values()];
    const complete = known.filter((state) => state === "done").length;
    const active = [...layers.entries()]
      .filter(([, state]) => state === "downloading")
      .slice(0, 3)
      .map(
        ([id]) =>
          `${soft(id.slice(0, 12).padEnd(12))} ${humanBytes(bytes.get(id) ?? 0)}`,
      );
    const headline = known.length
      ? `${bar(complete, known.length)}  ${complete}/${known.length} layers`
      : "contacting registry";
    spin.message(
      ["Pulling container images", headline, ...active].join("\n   "),
    );
  };

  await stream(cwd, services, (line) => {
    const match = line.match(/^\s*([0-9a-f]{8,}|Image \S+)\s+(.+?)\s*$/);
    if (!match) return;
    const [, id, rest] = match;
    if (id!.startsWith("Image ")) return;
    const status = rest!.replace(/\s+[\d.]+[A-Za-z]*B$/, "").toLowerCase();
    // Only "Downloading" lines carry a meaningful byte count. "Download
    // complete 0B" and "Extracting 1B" report placeholders that would
    // otherwise erase the real figure, so keep the high-water mark.
    if (status.startsWith("downloading")) {
      const size = rest!.match(/([\d.]+)([kKmMgG]?)B$/);
      if (size) {
        const scale = { k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[
          size[2]!.toLowerCase()
        ];
        const observed = Number(size[1]) * (scale ?? 1);
        bytes.set(id!, Math.max(bytes.get(id!) ?? 0, observed));
      }
    }
    const next =
      terminal[status] ??
      (status.startsWith("downloading") || status.startsWith("extracting")
        ? "downloading"
        : "waiting");
    // Never let a late "downloading" line demote a layer already pulled.
    if (layers.get(id!) === "done" && next !== "done") return;
    layers.set(id!, next);
    render();
  });

  const total = [...bytes.values()].reduce((sum, value) => sum + value, 0);
  const summary = [
    `${layers.size} layers`,
    total > 0 ? humanBytes(total) : null,
    humanDuration(performance.now() - startedAt),
  ]
    .filter(Boolean)
    .join(" · ");
  spin.stop(
    layers.size === 0
      ? "Container images are up to date"
      : `Container images downloaded  ${soft(`· ${summary}`)}`,
  );
}

function stream(
  cwd: string,
  services: string[],
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["compose", "--progress", "plain", "pull", ...services],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    );
    let buffer = "";
    const tail: string[] = [];
    const consume = (chunk: Buffer) => {
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
          `docker compose pull failed${tail.length ? `:\n${tail.join("\n")}` : "."}`,
        ),
      );
    });
  });
}

function runPlain(cwd: string, services: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "pull", ...services], {
      cwd,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`docker compose pull failed with code ${code}.`)),
    );
  });
}
