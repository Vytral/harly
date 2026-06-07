import "dotenv/config";

import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://openhire:openhire@localhost:5432/openhire";

export default defineConfig({
  out: "./packages/db/migrations",
  schema: "./packages/db/src/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
