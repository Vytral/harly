import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ??
    "postgresql://openhire:openhire@localhost:5432/openhire"
  );
}

export function createDatabaseClient(connectionString = getDatabaseUrl()) {
  const sql = postgres(connectionString, {
    prepare: false,
  });

  const db = drizzle(sql, { schema });

  return { db, sql };
}

type DatabaseClient = ReturnType<typeof createDatabaseClient>;

declare global {
  var openhireDatabase: DatabaseClient | undefined;
}

const globalDatabase = globalThis.openhireDatabase ?? createDatabaseClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.openhireDatabase = globalDatabase;
}

export const db = globalDatabase.db;
export const sql = globalDatabase.sql;
export { schema };
