import "dotenv/config";

import { createDatabaseClient } from "../src";

/**
 * Identity (users, organizations, members) is owned by Better Auth and created
 * through the signup + onboarding flow, so there is nothing to seed here.
 * Sign up at /signup and create a workspace at /onboarding to get started.
 */
async function main() {
  const { sql } = createDatabaseClient();

  try {
    console.log(
      "Seed is a no-op. Create your first workspace via /signup → /onboarding.",
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Database seed failed.");
  console.error(error);
  process.exit(1);
});
