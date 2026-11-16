import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { customRoles, db, member } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { requireUnrestrictedKeyScope } from "./actor";

describe.skipIf(!runPipelineIntegration)("requireUnrestrictedKeyScope", () => {
  let fx: PipelineFixture;
  const memberId = `scope-${Math.random().toString(36).slice(2, 10)}`;

  beforeAll(async () => {
    fx = await createPipelineFixture();
    await db.insert(member).values({
      id: memberId,
      organizationId: fx.workspaceId,
      userId: fx.userId,
      role: "recruiter",
      createdAt: new Date(),
    });
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  it("allows an unrestricted role and an owner", async () => {
    await expect(
      requireUnrestrictedKeyScope(fx.workspaceId, fx.userId),
    ).resolves.toBeUndefined();
    await db.update(member).set({ role: "owner" }).where(eq(member.id, memberId));
    await expect(
      requireUnrestrictedKeyScope(fx.workspaceId, fx.userId),
    ).resolves.toBeUndefined();
  });

  it("denies a role limited to assigned jobs, a missing creator and an inactive creator", async () => {
    await db.update(member).set({ role: "scoped" }).where(eq(member.id, memberId));
    await db.insert(customRoles).values({
      workspaceId: fx.workspaceId,
      key: "scoped",
      name: "Scoped",
      permissions: ["reports:read"],
      scope: { jobAccess: "assigned" },
    });
    await expect(
      requireUnrestrictedKeyScope(fx.workspaceId, fx.userId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      requireUnrestrictedKeyScope(fx.workspaceId, null),
    ).rejects.toMatchObject({ status: 403 });

    await db
      .update(member)
      .set({ role: "owner", status: "inactive" })
      .where(eq(member.id, memberId));
    await expect(
      requireUnrestrictedKeyScope(fx.workspaceId, fx.userId),
    ).rejects.toMatchObject({ status: 403 });
  });
});
