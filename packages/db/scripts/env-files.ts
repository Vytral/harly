import { existsSync, readFileSync } from "node:fs";

import { parse } from "dotenv";

/**
 * Apply settings from local env files to `env`, in priority order (first file
 * wins). Each file is parsed on its own so that an empty value in a
 * higher-priority file does not hide a real value in a later one:
 * `.env.example` lists optional settings as `""`, and skipping them lets the
 * scripts' own defaults (`process.env.X ?? default`) still apply. Variables
 * already set in `env` (CI, a shell export) always win. Missing files are
 * ignored.
 */
export function applyEnvFiles(
  files: readonly string[],
  env: Record<string, string | undefined>,
): void {
  for (const file of files) {
    if (!existsSync(file)) continue;
    const values = parse(readFileSync(file));
    for (const [name, value] of Object.entries(values)) {
      if (value !== "" && env[name] === undefined) {
        env[name] = value;
      }
    }
  }
}
