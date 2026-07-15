import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  db,
  deploymentBootstrap,
  member,
  organization,
  user,
} from "@harly/db";

import {
  authorizeUserCreation,
  completeDeploymentBootstrap,
  reserveSetupClaim,
} from "./setup";

const integration = process.env.RUN_SETUP_INTEGRATION === "1" ? describe : describe.skip;
const userId = randomUUID();
const email = "bootstrap-owner@example.com";

integration("deployment bootstrap concurrency", () => {
  beforeAll(async () => {
    await db.delete(deploymentBootstrap);
    await db.insert(user).values({ id: userId, name: "Bootstrap Owner", email });
  });

  afterAll(async () => {
    await db.delete(deploymentBootstrap);
    await db.delete(organization);
    await db.delete(user).where(eq(user.id, userId));
  });

  it("permits only the claimed email and creates exactly one owner", async () => {
    const claim = await reserveSetupClaim({
      token: "integration-setup-secret",
      setupSecret: "integration-setup-secret",
      initialAdminEmail: email,
    });

    await expect(authorizeUserCreation({ email, claimId: claim.claimId })).resolves.toBeUndefined();
    await expect(
      authorizeUserCreation({ email: "attacker@example.com", claimId: claim.claimId }),
    ).rejects.toThrow(/initial administrator|setup/i);

    const attempts = await Promise.allSettled([
      completeDeploymentBootstrap({
        claimId: claim.claimId,
        userId,
        email,
        organizationName: "First workspace",
        organizationSlug: "first-workspace",
      }),
      completeDeploymentBootstrap({
        claimId: claim.claimId,
        userId,
        email,
        organizationName: "Second workspace",
        organizationSlug: "second-workspace",
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const [[organizations], [owners], [bootstraps]] = await Promise.all([
      db.select({ value: count() }).from(organization),
      db.select({ value: count() }).from(member).where(eq(member.role, "owner")),
      db.select({ value: count() }).from(deploymentBootstrap),
    ]);
    expect(organizations.value).toBe(1);
    expect(owners.value).toBe(1);
    expect(bootstraps.value).toBe(1);
  });
});
