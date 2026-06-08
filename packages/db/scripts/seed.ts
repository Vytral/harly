import "dotenv/config";

import { createDatabaseClient, schema } from "../src";

async function main() {
  const { db, sql } = createDatabaseClient();
  const now = new Date();

  try {
    await db
      .insert(schema.user)
      .values({
        id: "seed-user-local",
        name: "Harly Admin",
        email: "admin@harly.test",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.organization)
      .values({
        id: "seed-org-local",
        name: "Harly Demo",
        slug: "harly-demo",
        createdAt: now,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.member)
      .values({
        id: "seed-member-local",
        organizationId: "seed-org-local",
        userId: "seed-user-local",
        role: "owner",
        createdAt: now,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.workspaceSettings)
      .values({
        organizationId: "seed-org-local",
        tagline: "Open recruiting workspace",
        description: "Local development workspace for Harly.",
        primaryColor: "#2563eb",
      })
      .onConflictDoNothing();

    console.log("Seeded local Harly workspace.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Database seed failed.");
  console.error(error);
  process.exit(1);
});
