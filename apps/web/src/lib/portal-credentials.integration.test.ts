import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import {
  candidatePortalCodes,
  candidatePortalCredentials,
  candidates,
  db,
  organization,
  workspaceSettings,
} from "@harly/db";

import {
  consumeOneTimeCode,
  consumeRecoveryCode,
  countRecoveryCodes,
  createPortalCandidate,
  findActiveCandidateByEmail,
  issueOneTimeCode,
  regenerateRecoveryCodes,
  setCandidatePassword,
  verifyPasswordLogin,
} from "./portal-credentials";
import { getPortalAuthMethods } from "./portal-auth-methods";

/**
 * Needs a migrated throwaway Postgres:
 *   PORTAL_AUTH_INTEGRATION=1 DATABASE_URL=postgresql://.../portal_auth_test pnpm exec vitest run <file>
 */
const run = process.env.PORTAL_AUTH_INTEGRATION === "1";

describe.skipIf(!run)("portal credentials (database)", () => {
  const tag = randomUUID().slice(0, 8);
  const workspaceId = `ws-portal-${tag}`;
  const otherWorkspaceId = `ws-portal-other-${tag}`;
  let candidateId: string;

  beforeAll(async () => {
    for (const id of [workspaceId, otherWorkspaceId]) {
      await db.insert(organization).values({
        id,
        name: id,
        slug: id,
        createdAt: new Date(),
      });
    }
    const id = await createPortalCandidate({
      workspaceId,
      email: `Jane.${tag}@Example.com`,
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(id).toBeTruthy();
    candidateId = id!;
  });

  afterAll(async () => {
    for (const id of [workspaceId, otherWorkspaceId]) {
      await db.delete(organization).where(eq(organization.id, id));
    }
  });

  it("refuses to create a second candidate with the same email", async () => {
    const again = await createPortalCandidate({
      workspaceId,
      email: `jane.${tag}@example.com`,
      firstName: "X",
      lastName: "Y",
    });
    expect(again).toBeNull();
  });

  it("returns the saved email locale with the active candidate lookup", async () => {
    await db
      .update(candidates)
      .set({ preferredEmailLocale: "fr" })
      .where(eq(candidates.id, candidateId));

    await expect(
      findActiveCandidateByEmail(workspaceId, `JANE.${tag}@EXAMPLE.COM`),
    ).resolves.toMatchObject({
      id: candidateId,
      preferredEmailLocale: "fr",
    });
  });

  it("stores only a hash and verifies logins without revealing why they fail", async () => {
    await setCandidatePassword(candidateId, workspaceId, "a long enough password");
    const [row] = await db
      .select()
      .from(candidatePortalCredentials)
      .where(eq(candidatePortalCredentials.candidateId, candidateId));
    expect(row?.passwordHash).toMatch(/^scrypt\$/);
    expect(row?.passwordHash).not.toContain("long enough");

    const email = `jane.${tag}@example.com`;
    expect(await verifyPasswordLogin(workspaceId, email, "a long enough password")).toEqual({ candidateId });
    expect(await verifyPasswordLogin(workspaceId, email, "wrong password!!")).toBeNull();
    expect(await verifyPasswordLogin(workspaceId, "nobody@example.com", "a long enough password")).toBeNull();
    expect(await verifyPasswordLogin(otherWorkspaceId, email, "a long enough password")).toBeNull();
  });

  it("locks the account after sustained failures, then recovers after the lock", async () => {
    const email = `jane.${tag}@example.com`;
    for (let i = 0; i < 30; i++) await verifyPasswordLogin(workspaceId, email, "bad password 123");
    expect(await verifyPasswordLogin(workspaceId, email, "a long enough password")).toBeNull();
    await db
      .update(candidatePortalCredentials)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(candidatePortalCredentials.candidateId, candidateId));
    expect(await verifyPasswordLogin(workspaceId, email, "a long enough password")).toEqual({ candidateId });
  }, 60_000);

  it("access codes are single use, hashed, scoped to the workspace and kind", async () => {
    const { code } = await issueOneTimeCode({ candidateId, workspaceId, kind: "access" });
    const stored = await db.select().from(candidatePortalCodes).where(eq(candidatePortalCodes.candidateId, candidateId));
    expect(stored.some((r) => r.codeHash === code)).toBe(false);

    expect(await consumeOneTimeCode("reset", code, workspaceId)).toBeNull();
    expect(await consumeOneTimeCode("access", code, otherWorkspaceId)).toBeNull();
    expect(await consumeOneTimeCode("access", code, workspaceId)).toEqual({ candidateId });
    expect(await consumeOneTimeCode("access", code, workspaceId)).toBeNull();
  });

  it("expired codes are rejected and a newer code revokes the previous one", async () => {
    const first = await issueOneTimeCode({ candidateId, workspaceId, kind: "access" });
    const second = await issueOneTimeCode({ candidateId, workspaceId, kind: "access" });
    expect(await consumeOneTimeCode("access", first.code, workspaceId)).toBeNull();
    await db
      .update(candidatePortalCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(candidatePortalCodes.candidateId, candidateId));
    expect(await consumeOneTimeCode("access", second.code, workspaceId)).toBeNull();
  });

  it("reset codes work once for the reset kind only", async () => {
    const { code } = await issueOneTimeCode({ candidateId, workspaceId, kind: "reset", createdBy: "recruiter-1" });
    expect(await consumeOneTimeCode("access", code, workspaceId)).toBeNull();
    expect(await consumeOneTimeCode("reset", code, workspaceId)).toEqual({ candidateId });
    expect(await consumeOneTimeCode("reset", code, workspaceId)).toBeNull();
  });

  it("recovery codes: 8 issued, single use, replaced on regeneration", async () => {
    const codes = await regenerateRecoveryCodes(candidateId, workspaceId);
    expect(codes).toHaveLength(8);
    expect(await countRecoveryCodes(candidateId)).toBe(8);
    expect(await consumeRecoveryCode(candidateId, codes[0]!.toLowerCase())).toBe(true);
    expect(await consumeRecoveryCode(candidateId, codes[0]!)).toBe(false);
    expect(await countRecoveryCodes(candidateId)).toBe(7);
    const fresh = await regenerateRecoveryCodes(candidateId, workspaceId);
    expect(await consumeRecoveryCode(candidateId, codes[1]!)).toBe(false);
    expect(await consumeRecoveryCode(candidateId, fresh[1]!)).toBe(true);
    const otherId = await createPortalCandidate({ workspaceId, email: `o.${tag}@example.com`, firstName: "O", lastName: "" });
    expect(await consumeRecoveryCode(otherId!, fresh[2]!)).toBe(false);
  });

  it("getPortalAuthMethods: a new workspace offers password + access code only", async () => {
    const methods = await getPortalAuthMethods(workspaceId);
    expect(methods).toMatchObject({ password: true, accessCode: true, magicLink: false, passkey: false });
  });
});

describe.skipIf(!run)("migration 0165 backfill (database)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids = {
    legacyEmail: `mig-email-${tag}`,
    legacyOauth: `mig-oauth-${tag}`,
    bare: `mig-bare-${tag}`,
    already: `mig-already-${tag}`,
  };

  afterAll(async () => {
    for (const id of Object.values(ids)) await db.delete(organization).where(eq(organization.id, id));
  });

  it("keeps magic link/OAuth for existing workspaces and adds password only where nothing external exists", async () => {
    for (const id of Object.values(ids)) {
      await db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
    }
    await db.insert(workspaceSettings).values([
      { organizationId: ids.legacyEmail, emailEnabled: true },
      { organizationId: ids.legacyOauth, portalGoogleClientId: "client" },
      { organizationId: ids.bare },
      { organizationId: ids.already, portalAuthMethods: { password: true } },
    ]);

    const dir = path.resolve(__dirname, "../../../../packages/db/migrations");
    const file = readdirSync(dir).find((f) => f.startsWith("0165_"))!;
    const statement = readFileSync(path.join(dir, file), "utf8")
      .split("--> statement-breakpoint")
      .find((s) => s.includes("UPDATE \"workspace_settings\""))!;
    await db.execute(sql.raw(statement));

    const read = async (id: string) =>
      (await db.select({ m: workspaceSettings.portalAuthMethods }).from(workspaceSettings).where(eq(workspaceSettings.organizationId, id)))[0]!.m as Record<string, boolean>;

    expect(await read(ids.legacyEmail)).toMatchObject({ magicLink: true, google: true, password: false, accessCode: false });
    expect(await read(ids.legacyOauth)).toMatchObject({ magicLink: true, google: true, password: false });
    expect(await read(ids.bare)).toMatchObject({ password: true, accessCode: true });
    expect(await read(ids.already)).toEqual({ password: true });
  });
});
