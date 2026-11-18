// Loads local settings for the database scripts and drizzle-kit. CONTRIBUTING.md
// tells contributors to put them in the repository's `.env.local`, so read that
// first, then `packages/db/.env`. Variables already set in the environment
// (CI, a shell export) always win.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const loaded: Record<string, string> = {};
config({
  path: [
    path.resolve(packageDirectory, "../../.env.local"),
    path.resolve(packageDirectory, ".env"),
  ],
  processEnv: loaded,
  quiet: true,
});

// `.env.example` lists optional settings as empty strings. Skip them so the
// scripts' own defaults (`process.env.X ?? default`) still apply.
for (const [name, value] of Object.entries(loaded)) {
  if (value !== "" && process.env[name] === undefined) {
    process.env[name] = value;
  }
}
