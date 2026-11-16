import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, member } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { actorCanActOnApplication, actorHasPermission } from "./workflow-permissions";

describe.skipIf(!runPipelineIntegration)("workflow actor permissions", () => {
  let fx: PipelineFixture;
  const memberId = `wf-perm-${Math.random().toString(36).slice(2, 10)}`;

  beforeAll(async () => {
    fx = await createPipelineFixture();
    await db.insert(member).values({
      id: memberId,
      organizationId: fx.workspaceId,
      userId: fx.userId,
      role: "admin",
      createdAt: new Date(),
    });
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  it("allows an active member that holds the permission", async () => {
    await expect(
      actorHasPermission(db, fx.workspaceId, fx.userId, "candidates:edit"),
    ).resolves.toEqual({ ok: true });
  });

  it.each(["inactive", "suspended"] as const)(
    "denies a %s member even though the role row still exists",
    async (status) => {
      await db.update(member).set({ status }).where(eq(member.id, memberId));
      const result = await actorHasPermission(
        db,
        fx.workspaceId,
        fx.userId,
        "candidates:edit",
      );
      expect(result.ok).toBe(false);
      const { applicationId } = await fx.addApplication({
        stageId: fx.stages.applied!.id,
      });
      await expect(
        actorCanActOnApplication(db, fx.workspaceId, fx.userId, applicationId),
      ).resolves.toMatchObject({ ok: false });
      await db.update(member).set({ status: "active" }).where(eq(member.id, memberId));
    },
  );
});
