import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  db,
  deploymentBootstrap,
  member,
  organization,
  user,
  workspaceSettings,
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

integration("invite-link sign-up gate", () => {
  const orgId = randomUUID();
  const linkToken = `link-${randomUUID()}`;

  beforeAll(async () => {
    await db.delete(deploymentBootstrap);
    await db.insert(deploymentBootstrap).values({
      id: 1,
      authorizedEmail: "owner@example.test",
      completedAt: new Date(),
    });
    await db.insert(organization).values({
      id: orgId,
      name: "Link Workspace",
      slug: `link-${orgId.slice(0, 8)}`,
      createdAt: new Date(),
    });
    await db.insert(workspaceSettings).values({
      organizationId: orgId,
      inviteLinkToken: linkToken,
      inviteLinkRole: "recruiter",
      inviteLinkEnabled: true,
    });
  });

  afterAll(async () => {
    await db.delete(workspaceSettings).where(eq(workspaceSettings.organizationId, orgId));
    await db.delete(organization).where(eq(organization.id, orgId));
    await db.delete(deploymentBootstrap);
  });

  it("allows sign-up with a valid invite link token", async () => {
    await expect(
      authorizeUserCreation({ email: "newcomer@example.test", inviteLinkToken: linkToken }),
    ).resolves.toBeUndefined();
  });

  it("still blocks sign-up without a token or with a wrong one", async () => {
    await expect(authorizeUserCreation({ email: "newcomer@example.test" })).rejects.toThrow(/invite-only/i);
    await expect(
      authorizeUserCreation({ email: "newcomer@example.test", inviteLinkToken: "wrong" }),
    ).rejects.toThrow(/invite-only/i);
  });

  it("rejects a disabled invite link", async () => {
    await db
      .update(workspaceSettings)
      .set({ inviteLinkEnabled: false })
      .where(eq(workspaceSettings.organizationId, orgId));
    await expect(
      authorizeUserCreation({ email: "newcomer@example.test", inviteLinkToken: linkToken }),
    ).rejects.toThrow(/invite-only/i);
  });
});
