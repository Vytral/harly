// Loads local settings for the database scripts and drizzle-kit. CONTRIBUTING.md
// tells contributors to put them in the repository's `.env.local`, so read that
// first, then `packages/db/.env`. Variables already set in the environment
// (CI, a shell export) always win.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyEnvFiles } from "./env-files";

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

applyEnvFiles(
  [
    path.resolve(packageDirectory, "../../.env.local"),
    path.resolve(packageDirectory, ".env"),
  ],
  process.env,
);
