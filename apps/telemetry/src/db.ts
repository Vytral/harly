import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Payload } from "./schema.js";
import { ACTIVE_WINDOW_MS, type EventStore, type Stats } from "./store.js";

const SCHEMA_VERSION = 1;

/** Ordered, idempotent migrations. Index i upgrades user_version i -> i+1. */
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     instance_id TEXT NOT NULL,
     event TEXT NOT NULL,
     cli_version TEXT NOT NULL,
     os TEXT NOT NULL,
     arch TEXT NOT NULL,
     deploy_mode TEXT,
     referral TEXT,
     first_seen_at TEXT NOT NULL,
     last_seen_at TEXT NOT NULL,
     UNIQUE (instance_id, event)
   );
   CREATE INDEX IF NOT EXISTS events_last_seen_idx ON events (last_seen_at);`,
];

export class Store implements EventStore {
  private readonly db: DatabaseSync;
  private readonly upsertStmt;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
    this.migrate();
    this.upsertStmt = this.db.prepare(
      `INSERT INTO events (instance_id, event, cli_version, os, arch, deploy_mode, referral, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (instance_id, event) DO UPDATE SET
         cli_version = excluded.cli_version,
         os = excluded.os,
         arch = excluded.arch,
         deploy_mode = COALESCE(excluded.deploy_mode, deploy_mode),
         referral = COALESCE(excluded.referral, referral),
         last_seen_at = excluded.last_seen_at`,
    );
  }

  private migrate(): void {
    const row = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    for (let v = row.user_version; v < SCHEMA_VERSION; v++) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(MIGRATIONS[v]!);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
  }

  upsert(payload: Payload, now: Date = new Date()): void {
    const ts = now.toISOString();
    this.upsertStmt.run(
      payload.instanceId.toLowerCase(),
      payload.event,
      payload.cliVersion,
      payload.os,
      payload.arch,
      payload.deployMode ?? null,
      payload.referral ?? null,
      ts,
      ts,
    );
  }

  private group(sql: string, ...params: string[]): Record<string, number> {
    const rows = this.db.prepare(sql).all(...params) as { k: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.k, r.n]));
  }

  /** Aggregates only; instance ids never leave the store. */
  stats(now: Date = new Date()): Stats {
    const since = new Date(now.getTime() - ACTIVE_WINDOW_MS).toISOString();
    const total = this.db.prepare("SELECT COUNT(DISTINCT instance_id) AS n FROM events").get() as { n: number };
    const active = this.db
      .prepare("SELECT COUNT(DISTINCT instance_id) AS n FROM events WHERE last_seen_at >= ?")
      .get(since) as { n: number };
    const by = (expr: string) =>
      this.group(`SELECT ${expr} AS k, COUNT(DISTINCT instance_id) AS n FROM events GROUP BY k ORDER BY n DESC, k`);
    return {
      totalInstances: total.n,
      active30d: active.n,
      byReferral: by("COALESCE(referral, 'unknown')"),
      byCliVersion: by("cli_version"),
      byOsArch: by("os || '/' || arch"),
      byDeployMode: by("COALESCE(deploy_mode, 'unknown')"),
    };
  }

  ping(): void {
    this.db.prepare("SELECT 1").get();
  }

  /** Test helper: raw rows for inspection. */
  rows(): Record<string, unknown>[] {
    return this.db.prepare("SELECT * FROM events ORDER BY id").all() as Record<string, unknown>[];
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }
}
