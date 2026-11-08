import pg from "pg";
import type { Payload } from "./schema.js";
import { ACTIVE_WINDOW_MS, type Counts, type EventStore, type Stats } from "./store.js";

const SCHEMA_VERSION = 1;
const LOCK_KEY = 727_001; // arbitrary app-wide advisory lock id for migrations

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS events (
     id BIGSERIAL PRIMARY KEY,
     instance_id TEXT NOT NULL,
     event TEXT NOT NULL,
     cli_version TEXT NOT NULL,
     os TEXT NOT NULL,
     arch TEXT NOT NULL,
     deploy_mode TEXT,
     referral TEXT,
     first_seen_at TIMESTAMPTZ NOT NULL,
     last_seen_at TIMESTAMPTZ NOT NULL,
     UNIQUE (instance_id, event)
   )`,
  `CREATE INDEX IF NOT EXISTS events_last_seen_idx ON events (last_seen_at)`,
];

/**
 * Postgres store. Uses `pg` with a pool of one connection: each serverless
 * instance handles one request at a time, and Neon's pooled (PgBouncer)
 * endpoint multiplexes the instances. The migration runs once per instance
 * (memoized promise) under an advisory lock so concurrent cold starts are safe.
 */
export class PgStore implements EventStore {
  private readonly pool: pg.Pool;
  private ready: Promise<void> | undefined;

  constructor(connectionString: string, pool?: pg.Pool) {
    this.pool = pool ?? new pg.Pool({
      connectionString,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
    });
    // An idle-client error (e.g. the server closing the socket) must not crash the process.
    this.pool.on("error", () => {});
  }

  /** Idempotent; the first call migrates, later calls reuse the same promise. */
  migrate(): Promise<void> {
    this.ready ??= this.runMigrations().catch((error) => {
      this.ready = undefined; // allow a retry on the next request
      throw error;
    });
    return this.ready;
  }

  private async runMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      await client.query("CREATE TABLE IF NOT EXISTS telemetry_schema (version INTEGER NOT NULL)");
      const current = await client.query<{ version: number }>("SELECT MAX(version) AS version FROM telemetry_schema");
      const from = current.rows[0]?.version ?? 0;
      for (let v = from; v < SCHEMA_VERSION; v++) {
        await client.query(MIGRATIONS[v]!);
        await client.query("INSERT INTO telemetry_schema (version) VALUES ($1)", [v + 1]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async upsert(payload: Payload, now: Date = new Date()): Promise<void> {
    await this.migrate();
    await this.pool.query(
      `INSERT INTO events (instance_id, event, cli_version, os, arch, deploy_mode, referral, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (instance_id, event) DO UPDATE SET
         cli_version = EXCLUDED.cli_version,
         os = EXCLUDED.os,
         arch = EXCLUDED.arch,
         deploy_mode = COALESCE(EXCLUDED.deploy_mode, events.deploy_mode),
         referral = COALESCE(EXCLUDED.referral, events.referral),
         last_seen_at = EXCLUDED.last_seen_at`,
      [
        payload.instanceId.toLowerCase(),
        payload.event,
        payload.cliVersion,
        payload.os,
        payload.arch,
        payload.deployMode ?? null,
        payload.referral ?? null,
        now.toISOString(),
      ],
    );
  }

  private async group(expr: string): Promise<Counts> {
    const { rows } = await this.pool.query<{ k: string; n: number }>(
      `SELECT ${expr} AS k, COUNT(DISTINCT instance_id)::int AS n FROM events GROUP BY k ORDER BY n DESC, k`,
    );
    return Object.fromEntries(rows.map((r) => [r.k, r.n]));
  }

  async stats(now: Date = new Date()): Promise<Stats> {
    await this.migrate();
    const since = new Date(now.getTime() - ACTIVE_WINDOW_MS).toISOString();
    const [total, active, byReferral, byCliVersion, byOsArch, byDeployMode] = await Promise.all([
      this.pool.query<{ n: number }>("SELECT COUNT(DISTINCT instance_id)::int AS n FROM events"),
      this.pool.query<{ n: number }>("SELECT COUNT(DISTINCT instance_id)::int AS n FROM events WHERE last_seen_at >= $1", [since]),
      this.group("COALESCE(referral, 'unknown')"),
      this.group("cli_version"),
      this.group("os || '/' || arch"),
      this.group("COALESCE(deploy_mode, 'unknown')"),
    ]);
    return {
      totalInstances: total.rows[0]?.n ?? 0,
      active30d: active.rows[0]?.n ?? 0,
      byReferral,
      byCliVersion,
      byOsArch,
      byDeployMode,
    };
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  /** Test helper: raw rows for inspection. */
  async rows(): Promise<Record<string, unknown>[]> {
    await this.migrate();
    const { rows } = await this.pool.query("SELECT * FROM events ORDER BY id");
    return rows;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
