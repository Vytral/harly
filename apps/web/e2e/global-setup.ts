import path from "node:path";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDatabaseClient } from "@harly/db";

import { E2E_DATABASE_URL } from "./constants";

async function migrateE2EDatabase() {
  const { db, sql } = createDatabaseClient(E2E_DATABASE_URL);
  const migrationsFolder = path.resolve(
    process.cwd(),
    "../../packages/db/migrations",
  );

  try {
    // E2E owns a disposable database. Use the same append-only Drizzle
    // migrator as local development so new proposal/runtime tables cannot be
    // absent simply because the fixture database predates the worktree.
    await migrate(db, { migrationsFolder });
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export default async function globalSetup() {
  // Keep any @harly/db module initialization in this process on the dedicated
  // database too. The provisioner still passes the URL explicitly as a second
  // guard against accidentally using the normal local database.
  process.env.DATABASE_URL = E2E_DATABASE_URL;
  await migrateE2EDatabase();
  const { provisionE2EFixture } = await import("./provision");
  await provisionE2EFixture();
}
