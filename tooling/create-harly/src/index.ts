#!/usr/bin/env tsx

import "dotenv/config";

import { migrateMailUnification, sql } from "@harly/db";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.log(`Harly self-hosting CLI

Commands:
  harly migrate:mail-unification [--dry-run] [--workspace <id>]
`);
}

async function main() {
  if (command !== "migrate:mail-unification") {
    usage();
    if (command && command !== "--help" && command !== "-h") process.exitCode = 1;
    return;
  }

  const dryRun = args.includes("--dry-run");
  const workspaceIndex = args.indexOf("--workspace");
  const workspaceId = workspaceIndex >= 0 ? args[workspaceIndex + 1] : undefined;
  if (workspaceIndex >= 0 && !workspaceId) {
    throw new Error("--workspace requires an organization id.");
  }

  const report = await migrateMailUnification({ dryRun, workspaceId });
  console.log(JSON.stringify({ dryRun, ...report }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
