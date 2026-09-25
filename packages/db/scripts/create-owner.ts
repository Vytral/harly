/**
 * One-off: create (or repair) a real owner account with an email+password
 * credential for local development. Safe to re-run — upserts by email.
 *
 *   DATABASE_URL=... pnpm --filter @harly/db exec tsx scripts/create-owner.ts \
 *     "maxi@acme.test" "Password123!" "Maxi"
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db, sql, user, account, member, organization } from "../src/index";

async function main() {
  const email = (process.argv[2] ?? "maxi@acme.test").trim().toLowerCase();
  const password = process.argv[3] ?? "Password123!";
  const name = process.argv[4] ?? "Maxi";

  // Single-org deployment: attach to the first (only) organization.
  const [org] = await db.select().from(organization).limit(1);
  if (!org) {
    throw new Error("No organization found — nothing to attach the owner to.");
  }

  const now = new Date();
  const passwordHash = await hashPassword(password);

  // Upsert the user by email.
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  let userId: string;
  if (existing) {
    userId = existing.id;
    await db
      .update(user)
      .set({ name, emailVerified: true, updatedAt: now })
      .where(eq(user.id, userId));
  } else {
    userId = randomUUID();
    await db.insert(user).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Upsert the credential account (password).
  const [cred] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);

  if (cred) {
    await db
      .update(account)
      .set({ password: passwordHash, updatedAt: now })
      .where(eq(account.id, cred.id));
  } else {
    await db.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Upsert active owner membership.
  const [mem] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, org.id)))
    .limit(1);

  if (mem) {
    await db
      .update(member)
      .set({ role: "owner", status: "active" })
      .where(eq(member.id, mem.id));
  } else {
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: org.id,
      userId,
      role: "owner",
      status: "active",
      createdAt: now,
    });
  }

  console.log(`✓ Owner ready: ${email} (org ${org.name}, userId ${userId})`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
