import "dotenv/config";

import { eq, isNull } from "drizzle-orm";

import {
  createDatabaseClient,
  resolveUsernameAssignments,
  schema,
} from "../src";

async function main() {
  const { db, sql } = createDatabaseClient();

  try {
    const candidates = await db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .where(isNull(schema.user.username));

    if (candidates.length === 0) {
      console.log("No users missing a username. Nothing to do.");
      return;
    }

    const existingUsernames = await db
      .select({ username: schema.user.username })
      .from(schema.user);
    const historicalUsernames = await db
      .select({ oldUsername: schema.usernameHistory.oldUsername })
      .from(schema.usernameHistory);

    const taken = new Set<string>([
      ...existingUsernames
        .map((row) => row.username)
        .filter((v): v is string => Boolean(v)),
      ...historicalUsernames.map((row) => row.oldUsername),
    ]);

    const { updated, unresolvable } = resolveUsernameAssignments(
      candidates,
      taken,
    );

    for (const assignment of updated) {
      await db
        .update(schema.user)
        .set({ username: assignment.username })
        .where(eq(schema.user.id, assignment.id));
    }

    console.log(`Backfilled ${updated.length} username(s).`);
    console.log(
      `Conflicts resolved via suffix: ${updated.filter((u) => u.hadConflict).length}`,
    );
    if (unresolvable.length > 0) {
      console.log(`Unresolvable: ${unresolvable.length}`);
      for (const item of unresolvable) {
        console.log(`  - ${item.id}: ${item.reason}`);
      }
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Username backfill failed.");
  console.error(error);
  process.exit(1);
});
