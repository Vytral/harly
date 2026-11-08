import type { Config } from "./config.js";
import type { Payload } from "./schema.js";

export const ACTIVE_WINDOW_MS = 30 * 24 * 3600 * 1000;

export type Counts = Record<string, number>;
export type Stats = {
  totalInstances: number;
  active30d: number;
  byReferral: Counts;
  byCliVersion: Counts;
  byOsArch: Counts;
  byDeployMode: Counts;
};

/** Storage contract shared by SQLite (local/VPS) and Postgres (serverless). */
export interface EventStore {
  upsert(payload: Payload, now?: Date): void | Promise<void>;
  stats(now?: Date): Stats | Promise<Stats>;
  /** Throws if the backing database is unreachable. */
  ping(): void | Promise<void>;
  close(): void | Promise<void>;
}

/** Postgres when a connection string is configured, otherwise SQLite. */
export async function openStore(config: Config): Promise<EventStore> {
  if (config.databaseUrl) {
    const { PgStore } = await import("./pgstore.js");
    return new PgStore(config.databaseUrl);
  }
  const { Store } = await import("./db.js");
  return new Store(config.dbPath);
}
