import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function getDatabaseUrl() {
  const explicit = process.env.DATABASE_URL;
  if (explicit && explicit.trim() !== "") {
    return explicit;
  }
  // In production, a missing DATABASE_URL is a hard failure: silently falling
  // back to localhost would connect to the wrong (or no) database and produce
  // confusing crashes / unintended local data.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing required environment variable DATABASE_URL. Set it before starting Harly in production.",
    );
  }
  return "postgresql://harly:harly@localhost:5432/harly";
}

/**
 * Connections a single Node process may hold.
 *
 * Harly runs the web server and the scheduler as separate processes against one
 * database, and a managed Postgres plan can be as small as ~22 connections. The
 * limit is explicit so an operator can size it against their plan instead of
 * discovering the driver default by running out of connections.
 */
const DEFAULT_POOL_MAX = 10;

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer. Received "${raw}".`);
  }
  return parsed;
}

export function createDatabaseClient(connectionString = getDatabaseUrl()) {
  const sql = postgres(connectionString, {
    prepare: false,
    max: positiveInteger("HARLY_DB_POOL_MAX", DEFAULT_POOL_MAX),
    // Release idle connections instead of holding them for the life of the
    // process. Without this the pool only ever grows to its high-water mark.
    idle_timeout: positiveInteger("HARLY_DB_IDLE_TIMEOUT", 30),
    // Fail fast when the database is unreachable. The driver waits forever by
    // default, which turns a bad DATABASE_URL into a hung boot with no error.
    connect_timeout: positiveInteger("HARLY_DB_CONNECT_TIMEOUT", 10),
    // Recycle connections so a managed failover or a moved read replica does
    // not leave this process pinned to a connection that is no longer valid.
    max_lifetime: positiveInteger("HARLY_DB_MAX_LIFETIME", 60 * 30),
  });

  const db = drizzle(sql, { schema });

  return { db, sql };
}

type DatabaseClient = ReturnType<typeof createDatabaseClient>;
type LockClient = ReturnType<typeof postgres>;

declare global {
  var harlyDatabase: DatabaseClient | undefined;
  var harlyAdvisoryLockClients: Partial<Record<"cron" | "mailbox", LockClient>> | undefined;
}

// Cached in every environment, not just development. Development needs it so a
// hot reload does not leak a pool per reload; production needs it because the
// web server loads this module from more than one bundle, and an uncached
// client would give each of them its own pool against the same database.
const globalDatabase = globalThis.harlyDatabase ?? createDatabaseClient();
globalThis.harlyDatabase = globalDatabase;

export const db = globalDatabase.db;
export const sql = globalDatabase.sql;
export { schema };

/**
 * Small pools reserved for holding session-level advisory locks. A held lock
 * pins its connection for the whole job; reserving those from the main pool let
 * a burst of overlapping jobs take every connection while their own queries
 * (and web requests) waited for one, a self-deadlock. Each scope has its own
 * pool because locks nest: the mailbox-sync cron holds a "cron" lock while
 * syncMailbox takes a "mailbox" lock, so sharing one pool could deadlock the
 * same way. Created lazily, so a process that never takes a lock opens none.
 */
export type AdvisoryLockScope = "cron" | "mailbox";

const LOCK_POOL_DEFAULT_MAX: Record<AdvisoryLockScope, number> = { cron: 20, mailbox: 4 };
const LOCK_POOL_ENV: Record<AdvisoryLockScope, string> = {
  cron: "HARLY_DB_LOCK_POOL_MAX",
  mailbox: "HARLY_DB_MAILBOX_LOCK_POOL_MAX",
};

export function advisoryLockSql(scope: AdvisoryLockScope): LockClient {
  const pools = (globalThis.harlyAdvisoryLockClients ??= {});
  pools[scope] ??= postgres(getDatabaseUrl(), {
    prepare: false,
    max: positiveInteger(LOCK_POOL_ENV[scope], LOCK_POOL_DEFAULT_MAX[scope]),
    idle_timeout: positiveInteger("HARLY_DB_IDLE_TIMEOUT", 30),
    connect_timeout: positiveInteger("HARLY_DB_CONNECT_TIMEOUT", 10),
    max_lifetime: positiveInteger("HARLY_DB_MAX_LIFETIME", 60 * 30),
  });
  return pools[scope];
}
