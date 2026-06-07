import "dotenv/config";

import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDatabaseClient } from "../src/client";

async function main() {
  const { db, sql } = createDatabaseClient();
  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../migrations",
  );

  try {
    await migrate(db, {
      migrationsFolder,
    });
    console.log("Database migrations applied.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Database migration failed.");
  console.error(error);
  process.exit(1);
});
