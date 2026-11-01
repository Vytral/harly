import { readdir, stat } from "node:fs/promises";
import { connect } from "node:tls";
import path from "node:path";

export type ServiceState = {
  name: string;
  state: string;
  /** Docker healthcheck result; absent when the service defines none. */
  health?: string;
  running: boolean;
  /** true healthy, false unhealthy or starting, null when no healthcheck exists. */
  healthy: boolean | null;
};

/**
 * Parses `docker compose ps --all --format json`. Depending on the Compose
 * version that is one JSON array or one JSON object per line.
 */
export function parseComposePs(stdout: string): ServiceState[] {
  const text = stdout.trim();
  if (!text) return [];
  let items: unknown[] = [];
  try {
    const whole: unknown = JSON.parse(text);
    items = Array.isArray(whole) ? whole : [whole];
  } catch {
    for (const line of text.split("\n")) {
      try {
        items.push(JSON.parse(line));
      } catch {
        // Ignore warning lines mixed into the output.
      }
    }
  }
  const services: ServiceState[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = String(row.Service ?? row.Name ?? "");
    if (!name) continue;
    const state = String(row.State ?? "unknown").toLowerCase();
    const health = row.Health ? String(row.Health).toLowerCase() : undefined;
    services.push({
      name,
      state,
      health,
      running: state === "running",
      healthy: health ? health === "healthy" : null,
    });
  }
  return services;
}

/** One-line summary of a service for the status screen. */
export function describeService(service: ServiceState | undefined): { ok: boolean; detail: string } {
  if (!service) return { ok: false, detail: "not created" };
  if (!service.running) return { ok: service.state === "exited" && service.name === "migrate", detail: service.state };
  if (service.healthy === null) return { ok: true, detail: "running" };
  return service.healthy
    ? { ok: true, detail: "running · healthy" }
    : { ok: false, detail: `running · ${service.health}` };
}

/** `3 days ago`, `5 hours ago`, `just now`. */
export function formatAge(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

export type BackupInfo = { file: string; bytes: number; modified: Date; encrypted: boolean };

/** The newest archive in <installation>/backups, or null when there is none. */
export async function latestBackup(directory: string): Promise<BackupInfo | null> {
  const folder = path.join(directory, "backups");
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return null;
  }
  let best: BackupInfo | null = null;
  for (const name of names) {
    if (!/\.(tar\.gz|tar\.gz\.age)$/.test(name)) continue;
    const file = path.join(folder, name);
    try {
      const info = await stat(file);
      if (!info.isFile()) continue;
      if (!best || info.mtimeMs > best.modified.getTime()) {
        best = { file, bytes: info.size, modified: info.mtime, encrypted: name.endsWith(".age") };
      }
    } catch {
      // A file removed mid-scan is not a backup.
    }
  }
  return best;
}

export type CertificateInfo = {
  validTo: Date;
  daysLeft: number;
  issuer?: string;
  /** Whether the certificate chains to a trusted root for this hostname. */
  trusted: boolean;
};

export function daysUntil(date: Date, now = Date.now()): number {
  return Math.floor((date.getTime() - now) / 86_400_000);
}

/**
 * Reads the certificate a host presents on :443. Verification is off so an
 * expired or self-signed certificate can still be described; `trusted`
 * records what verification would have said.
 */
export function readCertificate(hostname: string, port = 443, timeoutMs = 4_000): Promise<CertificateInfo | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: CertificateInfo | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    const socket = connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const certificate = socket.getPeerCertificate();
      if (!certificate?.valid_to) return finish(null);
      const validTo = new Date(certificate.valid_to);
      if (Number.isNaN(validTo.getTime())) return finish(null);
      const issuer = certificate.issuer?.O ?? certificate.issuer?.CN;
      finish({
        validTo,
        daysLeft: daysUntil(validTo),
        issuer: Array.isArray(issuer) ? issuer[0] : issuer,
        trusted: socket.authorized,
      });
    });
    socket.once("timeout", () => finish(null));
    socket.once("error", () => finish(null));
  });
}
