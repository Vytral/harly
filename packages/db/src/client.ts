import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ??
    "postgresql://harly:harly@localhost:5432/harly"
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
  var harlyDatabase: DatabaseClient | undefined;
}

const globalDatabase = globalThis.harlyDatabase ?? createDatabaseClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.harlyDatabase = globalDatabase;
}

export const db = globalDatabase.db;
export const sql = globalDatabase.sql;
export { schema };
