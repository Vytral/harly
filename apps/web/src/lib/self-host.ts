import "server-only";

import { db, organization } from "@harly/db";

/**
 * Self-host model: one organization per deployment. These helpers let pages
 * reason about bootstrap state without an env flag , the rule is simply
 * "does an org already exist?". Mirrors the auth-core gate in
 * packages/auth/src/auth.ts.
 */
export async function organizationExists(): Promise<boolean> {
  const [row] = await db.select({ id: organization.id }).from(organization).limit(1);
  return Boolean(row);
}
