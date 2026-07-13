import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

function failIfMissing(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Missing required environment variable ${name}. Set it before starting Harly in production.`,
      );
    }
    return "";
  }
  return value;
}

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
